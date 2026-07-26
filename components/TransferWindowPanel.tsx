"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { MAIN_POOL, LANE_ORDER } from "@/lib/players";
import {
  transferCandidates,
  userTransferCount,
  USER_MAX_TRANSFERS_PER_WINDOW,
} from "@/lib/season/transfers";
import {
  buildFaBoard,
  buildAcademyBoard,
  recommendedFasForTeam,
  recommendedAcademyForTeam,
  USER_MAX_MANUAL_DEMOTES,
  countTeamAcademy,
  isRosterVacancy,
} from "@/lib/season/faMarket";
import {
  INTERNATIONAL_LABELS,
  seasonTeam,
  type LeagueId,
  type PlayerTransfer,
  type SeasonState,
  type TransferPlayer,
} from "@/lib/season/types";
import {
  splitFromRosterTimeMark,
  type RosterTimeSplit,
} from "@/lib/season/franchise";
import type { Champion, Lane, PlayerTier } from "@/lib/types";
import TeamIcon from "./TeamIcon";
import LaneIcon from "./LaneIcon";
import { ChemScore, ProjectedChemScore } from "./ChemistryRow";
import InactiveMarketBoard from "./season/InactiveMarketBoard";
import VacancyFillPicker from "./season/VacancyFillPicker";
import RegionTeamFilters, {
  matchesTeamFilters,
  type FilterTeam,
} from "./season/RegionTeamFilters";

// Transfer-window UI: the league-wide recap of roster moves at each window
// (after First Stand and MSI), plus the followed team's pending decisions with
// full player detail — skill tier, this split's grade, and champion pool. The
// season pauses on a transfer phase only while the user has decisions to make.

const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};
const noteColor = (n: number | null) =>
  n == null ? "text-rift-muted/45" : n >= 7 ? "text-emerald-400" : n < 5.5 ? "text-rift-redbright" : "text-rift-mutedbright";
const fmtNote = (n: number | null) => (n == null ? "–" : n.toFixed(1));

// The qualifying-split the window's grades are drawn from, for the criteria note.
const WINDOW_SPLIT: Record<string, string> = {
  "first-stand": "Winter Split + First Stand",
  msi: "Spring Split + MSI",
};

// Skill tier + split grade + champion pool for one moving player.
function PlayerChip({
  p,
  byId,
}: {
  p: TransferPlayer;
  byId: Map<number, Champion>;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {p.name && (
        <span className="text-[10px] text-rift-mutedbright font-medium max-w-[72px] truncate" title={p.name}>
          {p.name}
        </span>
      )}
      <span className={`w-4 text-center border text-[10px] font-display ${TIER_CLS[p.tier]}`}>
        {p.tier}
      </span>
      <span className={`text-[9px] tabular-nums ${noteColor(p.grade)}`} title="Split grade (1-10)">
        {fmtNote(p.grade)}
      </span>
      <span className="inline-flex gap-0.5" title="Champion pool (mains first)">
        {p.goodChamps.map((id, i) => {
          const c = byId.get(id);
          if (!c) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={id}
              src={c.iconUrl}
              alt={c.name}
              title={`${c.name}${i < MAIN_POOL ? " (main)" : ""}`}
              className={`w-4 h-4 object-cover border border-rift-line/40 ${i >= MAIN_POOL ? "opacity-50" : ""}`}
            />
          );
        })}
      </span>
    </span>
  );
}

// One completed (auto-applied or accepted) move: the star goes from→to, the
// swap comes back the other way.
function TransferRow({
  tr,
  season,
  byId,
}: {
  tr: PlayerTransfer;
  season: SeasonState;
  byId: Map<number, Champion>;
}) {
  const from = seasonTeam(season, tr.fromTeamId);
  const to = seasonTeam(season, tr.toTeamId);
  const controlledId = season.config.controlledTeamId;
  const mine = !!controlledId && (tr.fromTeamId === controlledId || tr.toTeamId === controlledId);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] py-1 border-t border-rift-line/15 first:border-t-0 ${mine ? "bg-rift-blue/[0.06]" : ""}`}
    >
      <LaneIcon lane={tr.lane} size="xs" className="shrink-0" />
      {mine && (
        <span className="px-1 border border-rift-blue/50 text-rift-bluebright text-[7px] uppercase tracking-[0.2em]">
          You
        </span>
      )}
      <span className="inline-flex items-center gap-1 text-rift-mutedbright">
        <TeamIcon iconKey={from?.iconKey ?? "shield"} logoUrl={from?.logoUrl} size={12} color={from?.color} />
        <span className="truncate max-w-[88px]">{from?.name ?? "—"}</span>
        <span className="text-rift-gold/60">→</span>
        <TeamIcon iconKey={to?.iconKey ?? "shield"} logoUrl={to?.logoUrl} size={12} color={to?.color} />
        <span className="truncate max-w-[88px]">{to?.name ?? "—"}</span>
      </span>
      <PlayerChip p={tr.star} byId={byId} />
      <span className="text-rift-muted/40">⇄</span>
      <PlayerChip p={tr.swap} byId={byId} />
    </div>
  );
}

export default function TransferWindowPanel() {
  const season = useDraftStore((s) => s.season);
  const champions = useDraftStore((s) => s.champions);
  const resolveSeasonTransfer = useDraftStore((s) => s.resolveSeasonTransfer);
  const aiDecideSeasonTransfers = useDraftStore((s) => s.aiDecideSeasonTransfers);
  const advanceSeasonTransfers = useDraftStore((s) => s.advanceSeasonTransfers);
  const shopSeasonTransfer = useDraftStore((s) => s.shopSeasonTransfer);
  const shopOffseasonFa = useDraftStore((s) => s.shopOffseasonFa);
  const shopFaToAcademy = useDraftStore((s) => s.shopFaToAcademy);
  const shopAcademyRecall = useDraftStore((s) => s.shopAcademyRecall);
  const shopAcademyRelease = useDraftStore((s) => s.shopAcademyRelease);
  const shopAcademyRookie = useDraftStore((s) => s.shopAcademyRookie);
  const shopRookie = useDraftStore((s) => s.shopRookie);
  const demoteFollowedPlayer = useDraftStore((s) => s.demoteFollowedPlayer);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [shopLane, setShopLane] = useState<Lane | null>(null);
  const [confirmDemoteLane, setConfirmDemoteLane] = useState<Lane | null>(null);
  /** Vacant lane whose fill picker is open (auto after demote). */
  const [fillLane, setFillLane] = useState<Lane | null>(null);
  /** Deep-link focus for InactiveMarketBoard lane filter. */
  const [boardFocus, setBoardFocus] = useState<{ kind: "fa" | "academy"; lane: Lane } | null>(
    null,
  );
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [splitFilter, setSplitFilter] = useState<RosterTimeSplit | null>(null);
  /** Whole panel disclosure — expanded by default (decisions + recap). */
  const [panelOpen, setPanelOpen] = useState(true);
  /** Demotions & roster entries disclosure — expanded by default. */
  const [rosterNewsOpen, setRosterNewsOpen] = useState(true);

  const byId = useMemo(
    () => new Map(champions.map((c) => [c.id, c] as const)),
    [champions],
  );
  // Candidate swaps for the lane the user is shopping (willing teams first).
  const candidates = useMemo(
    () => (season && shopLane ? transferCandidates(season, champions, shopLane) : []),
    [season, champions, shopLane],
  );

  const phase = season?.phases[season.phaseIndex];
  const atWindow = phase?.kind === "transfer" && phase.status === "in-progress";
  const controlledId = season?.config.controlledTeamId;
  const showInactiveBoards =
    !!atWindow && !!season?.franchise?.aging && !!controlledId;

  const faBoard = useMemo(() => {
    if (!showInactiveBoards || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    const exclude = new Set(season.franchise?.sameWindowDemoteIds ?? []);
    return buildFaBoard(
      season.franchise?.inactivePool ?? [],
      "all",
      byId,
      season.currentMeta,
      null,
      null,
      team.players,
      exclude,
    );
  }, [showInactiveBoards, season, controlledId, byId]);

  const faRecommended = useMemo(() => {
    if (!showInactiveBoards || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    const exclude = new Set(season.franchise?.sameWindowDemoteIds ?? []);
    return recommendedFasForTeam(
      season.franchise?.inactivePool ?? [],
      team.players,
      byId,
      season.currentMeta,
    ).filter((r) => !r.entry.player.id || !exclude.has(r.entry.player.id));
  }, [showInactiveBoards, season, controlledId, byId]);

  const academyBoard = useMemo(() => {
    if (!showInactiveBoards || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    // Do NOT exclude sameWindowDemoteIds from the display board — benched
    // players must appear under Academy N/5 immediately. Call-up is gated
    // via blockedCallUpIds on InactiveMarketBoard / VacancyFillPicker.
    return buildAcademyBoard(
      season.franchise?.inactivePool ?? [],
      controlledId,
      "all",
      byId,
      season.currentMeta,
      null,
      null,
      team.players,
    );
  }, [showInactiveBoards, season, controlledId, byId]);

  const sameWindowDemoteIds = useMemo(
    () => new Set(season?.franchise?.sameWindowDemoteIds ?? []),
    [season?.franchise?.sameWindowDemoteIds],
  );

  const academyRecommended = useMemo(() => {
    if (!showInactiveBoards || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    return recommendedAcademyForTeam(
      season.franchise?.inactivePool ?? [],
      controlledId,
      team.players,
      byId,
      season.currentMeta,
    ).filter((r) => !r.entry.player.id || !sameWindowDemoteIds.has(r.entry.player.id));
  }, [showInactiveBoards, season, controlledId, byId, sameWindowDemoteIds]);

  if (!season || !season.config.playerTransfers) return null;

  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const academyCount =
    controlled && season.franchise?.aging
      ? countTeamAcademy(season.franchise.inactivePool ?? [], controlled.id)
      : 0;
  const byEvent = season.transfersByEvent ?? {};
  // Roles your team has already used this window — one move per role.
  const movedLanes = new Set<Lane>();
  if (atWindow && phase?.event && controlled) {
    for (const m of byEvent[phase.event] ?? []) {
      if (m.fromTeamId === controlled.id || m.toTeamId === controlled.id) {
        movedLanes.add(m.lane);
      }
    }
  }
  // Per-window transfer cap (distinct roles already enforced by movedLanes).
  const usedCount =
    atWindow && phase?.event && controlled
      ? userTransferCount(season, phase.event, controlled.id)
      : 0;
  const capReached = usedCount >= USER_MAX_TRANSFERS_PER_WINDOW;
  // Hide any leftover proposal on a role already transacted.
  const proposals = (season.proposedTransfers ?? []).filter((p) => !movedLanes.has(p.lane));
  const windows = (Object.keys(byEvent) as Array<keyof typeof byEvent>).filter(
    (e) => (byEvent[e]?.length ?? 0) > 0,
  );

  // Retirements + demotions + roster entries from mid-split checkpoints and
  // the post-Worlds offseason (aging on), league-wide.
  const rosterNews = season.rosterNews ?? [];

  const filterTeams: FilterTeam[] = season.teams.map((t) => ({
    id: t.id,
    name: t.name,
    leagueId: t.leagueId,
    iconKey: t.iconKey,
    logoUrl: t.logoUrl,
    color: t.color,
  }));
  const teamsById = new Map(filterTeams.map((t) => [t.id, t] as const));

  const filteredRosterNews = rosterNews.filter((n) => {
    if (!matchesTeamFilters(n.teamId, teamsById, leagueFilter, teamFilter)) {
      return false;
    }
    if (!splitFilter) return true;
    return splitFromRosterTimeMark(n.timeMark) === splitFilter;
  });

  const transferMatchesFilter = (tr: PlayerTransfer) => {
    if (teamFilter) {
      return tr.fromTeamId === teamFilter || tr.toTeamId === teamFilter;
    }
    if (!leagueFilter) return true;
    const from = teamsById.get(tr.fromTeamId);
    const to = teamsById.get(tr.toTeamId);
    return from?.leagueId === leagueFilter || to?.leagueId === leagueFilter;
  };

  // Nothing to show yet.
  if (!atWindow && windows.length === 0 && rosterNews.length === 0) return null;

  // Next split label for the proceed button.
  const nextPhase = season.phases[season.phaseIndex + 1];
  const nextLabel = nextPhase?.label ?? "next split";

  // In a reality, tag each window with the franchise year so the timeline is
  // legible across many seasons ("post First Stand · Year 3").
  const yr = season.franchise ? ` · Year ${season.franchise.year}` : "";

  return (
    <div className="mb-8 border border-rift-gold/30 bg-rift-gold/[0.03]">
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-expanded={panelOpen}
        className="w-full px-3 py-1.5 border-b border-rift-gold/25 flex items-center gap-2 text-left hover:bg-rift-gold/[0.06] transition-all"
      >
        <span className="font-display text-sm tracking-wider text-rift-goldbright">
          Transfer Window
        </span>
        <span className="text-[8px] uppercase tracking-[0.3em] text-rift-muted/55">
          between splits
        </span>
        {(windows.length > 0 || rosterNews.length > 0) && (
          <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/45 tabular-nums">
            {windows.length > 0
              ? `${windows.reduce((n, e) => n + (byEvent[e]?.length ?? 0), 0)} moves`
              : ""}
            {windows.length > 0 && rosterNews.length > 0 ? " · " : ""}
            {rosterNews.length > 0 ? `${rosterNews.length} roster` : ""}
          </span>
        )}
        <span className="ml-auto text-rift-gold/70 text-sm leading-none" aria-hidden>
          {panelOpen ? "▴" : "▾"}
        </span>
      </button>

      {panelOpen && (
      <>
      {/* Followed team's pending decisions */}
      {atWindow && (
        <div className="px-3 py-2 border-b border-rift-gold/20 bg-rift-gold/[0.04]">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
              Your decisions{phase?.event ? ` — post ${INTERNATIONAL_LABELS[phase.event]}${yr}` : ""}
            </span>
            {!capReached && (
              <button
                type="button"
                onClick={() => aiDecideSeasonTransfers()}
                className="ml-auto px-2 py-0.5 border border-rift-blue/50 text-rift-bluebright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-blue/10 transition-all"
                title="Let the AI resolve proposals, shop upgrades, and bench weak lanes for FA/academy fills"
              >
                Let AI decide
              </button>
            )}
          </div>
          {proposals.length === 0 ? (
            <div className="text-[10px] italic text-rift-muted mb-2">
              No moves involving your team this window.
            </div>
          ) : (
            <div className="space-y-1.5 mb-2">
              {proposals.map((pr, i) => {
                const other = seasonTeam(season, pr.otherTeamId);
                const incoming = pr.kind === "incoming";
                return (
                  <div
                    key={`${pr.lane}-${pr.otherTeamId}-${i}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]"
                  >
                    <LaneIcon lane={pr.lane} size="xs" className="shrink-0" />
                    <span className="text-rift-mutedbright">
                      {incoming ? "Sign from" : "Poach by"}{" "}
                      <span className="text-rift-bluebright">{other?.name ?? "—"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[8px] uppercase tracking-[0.2em] text-emerald-400/70">In</span>
                      <PlayerChip p={pr.theirs} byId={byId} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-[8px] uppercase tracking-[0.2em] text-rift-redbright/70">Out</span>
                      <PlayerChip p={pr.mine} byId={byId} />
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => resolveSeasonTransfer(i, true)}
                        className="px-2 py-0.5 border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => resolveSeasonTransfer(i, false)}
                        className="px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-red/50 hover:text-rift-redbright transition-all"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shop your roster — pick a slot, see who's tradeable for it */}
          {controlled && (
            <div className="mb-2 border-t border-rift-gold/15 pt-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
                  Shop your roster
                </span>
                <span
                  className={`ml-auto text-[8px] uppercase tracking-[0.2em] tabular-nums ${capReached ? "text-rift-redbright/80" : "text-rift-muted/60"}`}
                  title={`Up to ${USER_MAX_TRANSFERS_PER_WINDOW} transfers per window, one per role`}
                >
                  {usedCount}/{USER_MAX_TRANSFERS_PER_WINDOW} signed
                </span>
                {showInactiveBoards && (
                  <span
                    className={`text-[8px] uppercase tracking-[0.2em] tabular-nums ${
                      (season.franchise?.manualDemotesThisWindow ?? 0) >= USER_MAX_MANUAL_DEMOTES
                        ? "text-rift-redbright/80"
                        : "text-rift-muted/60"
                    }`}
                    title={`Up to ${USER_MAX_MANUAL_DEMOTES} manual demotes to academy per window`}
                  >
                    {season.franchise?.manualDemotesThisWindow ?? 0}/{USER_MAX_MANUAL_DEMOTES} demoted
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {LANE_ORDER.map((lane, li) => {
                  const p = controlled.players[li];
                  if (!p) return null;
                  const vacant = isRosterVacancy(p);
                  const open = shopLane === lane;
                  const willing = candidates.filter((c) => c.willing);
                  const demoteCap =
                    !showInactiveBoards ||
                    (season.franchise?.manualDemotesThisWindow ?? 0) >= USER_MAX_MANUAL_DEMOTES;
                  const sameWindowRookie =
                    !!p.id && (season.franchise?.sameWindowRookieIds ?? []).includes(p.id);
                  const demoteBlocked = demoteCap || sameWindowRookie;
                  const confirming = confirmDemoteLane === lane;
                  return (
                    <div key={lane}>
                      <div className="flex items-center gap-2 text-[10px]">
                        <LaneIcon lane={lane} size="sm" className="shrink-0" />
                        {vacant ? (
                          <span className="text-[9px] uppercase tracking-[0.2em] text-amber-300/80">
                            Vacant — Academy / FA / Rookie or leave for AI
                          </span>
                        ) : (
                          <>
                            <PlayerChip
                              p={{ name: p.name, tier: p.tier, grade: null, goodChamps: p.goodChamps }}
                              byId={byId}
                            />
                            <ChemScore me={p} roster={controlled.players} />
                          </>
                        )}
                        {movedLanes.has(lane) ? (
                          <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-emerald-400/80">
                            ✓ signed this window
                          </span>
                        ) : vacant ? (
                          <button
                            type="button"
                            onClick={() => setFillLane(fillLane === lane ? null : lane)}
                            className="ml-auto px-2 py-0.5 border border-amber-500/40 text-amber-200/90 text-[8px] uppercase tracking-[0.2em] hover:border-amber-400/70 hover:bg-amber-500/10 transition-all"
                          >
                            {fillLane === lane ? "Close fill" : "Fill slot"}
                          </button>
                        ) : capReached ? (
                          <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-rift-muted/50">
                            cap reached
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setShopLane(open ? null : lane)}
                            className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
                          >
                            {open ? "Close" : "Find transfers"}
                          </button>
                        )}
                        {showInactiveBoards && !vacant && !movedLanes.has(lane) && (
                          confirming ? (
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  demoteFollowedPlayer(lane);
                                  setConfirmDemoteLane(null);
                                  setShopLane(null);
                                  setFillLane(lane);
                                }}
                                className="px-2 py-0.5 border border-rift-red/60 bg-rift-red/10 text-rift-redbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-red/20 transition-all"
                              >
                                Confirm bench
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDemoteLane(null)}
                                className="px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:text-rift-goldbright transition-all"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={demoteBlocked}
                              onClick={() => setConfirmDemoteLane(lane)}
                              title={
                                sameWindowRookie
                                  ? "Can't bench a rookie signed this window"
                                  : demoteCap
                                    ? `Demote cap (${USER_MAX_MANUAL_DEMOTES}/window) reached`
                                    : "Send to academy · opens vacancy for Academy / FA / Rookie / AI"
                              }
                              className="px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-red/50 hover:text-rift-redbright transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                            >
                              Bench
                            </button>
                          )
                        )}
                      </div>
                      {vacant && fillLane === lane && showInactiveBoards && (
                        <VacancyFillPicker
                          lane={lane}
                          academyRows={academyBoard.filter(
                            (r) =>
                              r.entry.player.lane === lane &&
                              (!r.entry.player.id ||
                                !sameWindowDemoteIds.has(r.entry.player.id)),
                          )}
                          faRows={faBoard.filter((r) => r.entry.player.lane === lane)}
                          signsUsed={season.franchise?.faSignsThisWindow ?? 0}
                          onAcademy={(id) => {
                            shopAcademyRecall(lane, id);
                            setFillLane(null);
                          }}
                          onFa={(id) => {
                            shopOffseasonFa(lane, id);
                            setFillLane(null);
                          }}
                          onRookie={() => {
                            shopRookie(lane);
                            setFillLane(null);
                          }}
                          onLeaveForAi={() => setFillLane(null)}
                          onBrowseBoard={(kind) => {
                            setBoardFocus({ kind, lane });
                            setFillLane(null);
                          }}
                        />
                      )}
                      {open && !movedLanes.has(lane) && !vacant && (
                        <div className="ml-8 mt-1 space-y-1">
                          {willing.length === 0 ? (
                            <div className="text-[9px] italic text-rift-muted">
                              No team will trade for this slot right now.
                            </div>
                          ) : (
                            willing.slice(0, 6).map((c) => {
                              const other = seasonTeam(season, c.otherTeamId);
                              const incoming = other?.players[li];
                              return (
                                <div
                                  key={c.otherTeamId}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]"
                                >
                                  <span className="inline-flex items-center gap-1 text-rift-mutedbright">
                                    <TeamIcon
                                      iconKey={other?.iconKey ?? "shield"}
                                      logoUrl={other?.logoUrl}
                                      size={12}
                                      color={other?.color}
                                    />
                                    <span className="truncate max-w-[96px]">{other?.name ?? "—"}</span>
                                  </span>
                                  <PlayerChip p={c.theirs} byId={byId} />
                                  {incoming && (
                                    <ProjectedChemScore
                                      roster={controlled.players}
                                      incoming={incoming}
                                      lane={lane}
                                    />
                                  )}
                                  <span
                                    className={`text-[9px] tabular-nums ${c.upgrade > 0.05 ? "text-emerald-400" : c.upgrade < -0.05 ? "text-rift-redbright" : "text-rift-muted/60"}`}
                                    title="Value change for your team"
                                  >
                                    {c.upgrade >= 0 ? "+" : ""}
                                    {c.upgrade.toFixed(1)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      shopSeasonTransfer(lane, c.otherTeamId);
                                      setShopLane(null);
                                    }}
                                    className="ml-auto px-2 py-0.5 border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                                  >
                                    Offer swap
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FA + Academy — user shops first; demotions/AI fills run on Proceed */}
          {showInactiveBoards && controlled && (
            <>
              <InactiveMarketBoard
                kind="fa"
                board={faBoard}
                recommended={faRecommended}
                signsUsed={season.franchise?.faSignsThisWindow ?? 0}
                academyCount={academyCount}
                onSign={shopOffseasonFa}
                onSignToAcademy={shopFaToAcademy}
                focusLane={boardFocus?.kind === "fa" ? boardFocus.lane : null}
              />
              <InactiveMarketBoard
                kind="academy"
                board={academyBoard}
                recommended={academyRecommended}
                signsUsed={season.franchise?.faSignsThisWindow ?? 0}
                academyCount={academyCount}
                onSign={shopAcademyRecall}
                onReleaseToFa={shopAcademyRelease}
                onAddAcademyRookie={() => shopAcademyRookie()}
                blockedCallUpIds={sameWindowDemoteIds}
                focusLane={boardFocus?.kind === "academy" ? boardFocus.lane : null}
              />
            </>
          )}

          <button
            type="button"
            onClick={() => advanceSeasonTransfers()}
            className="w-full py-1.5 border border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[10px] uppercase tracking-[0.25em] hover:bg-rift-gold/20 transition-all"
            title={
              season.franchise?.pendingMidSplitDemotion
                ? "Confirm your moves — league demotions & FA fills run after you proceed"
                : undefined
            }
          >
            Proceed to {nextLabel} →
          </button>
        </div>
      )}

      {/* League-wide recap, per window */}
      <div className="px-3 py-2">
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/55 mb-1">
          Around the leagues
        </div>
        {(windows.length > 0 || rosterNews.length > 0) && (
          <RegionTeamFilters
            teams={filterTeams}
            leagueFilter={leagueFilter}
            teamFilter={teamFilter}
            onLeagueFilter={setLeagueFilter}
            onTeamFilter={setTeamFilter}
            splitFilter={rosterNews.length > 0 ? splitFilter : null}
            onSplitFilter={rosterNews.length > 0 ? setSplitFilter : undefined}
          />
        )}
        {(atWindow || windows.length > 0) && (
          <p className="text-[9px] text-rift-muted/60 mb-2 leading-relaxed">
            Players are valued by skill tier, their grades over the{" "}
            {WINDOW_SPLIT[(phase?.event as string) ?? windows[0] ?? "first-stand"] ?? "recent split"},
            and how well their champion pool fits the new patch. The most underrated
            players move up to the best-finishing teams; weak links drop down. Cross-region.
          </p>
        )}
        {windows.length === 0 ? (
          // Only an "empty" note when we're actually at a transfer window — when
          // the panel is up solely for offseason retirements, the block below
          // speaks for itself.
          atWindow ? (
            <div className="text-[10px] italic text-rift-muted">
              No completed transfers yet.
            </div>
          ) : null
        ) : (
          windows.map((e) => {
            const moves = (byEvent[e] ?? []).filter(transferMatchesFilter);
            const isOpen = openEvent === e || windows.length === 1;
            return (
              <div key={e} className="mb-1.5">
                <button
                  type="button"
                  onClick={() => setOpenEvent(isOpen ? "__none__" : (e as string))}
                  className="w-full flex items-center justify-between px-2 py-1 border border-rift-line/40 bg-rift-bg/30 text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright hover:text-rift-goldbright transition-all"
                >
                  <span>
                    Post {INTERNATIONAL_LABELS[e]}{yr} — {moves.length} move{moves.length === 1 ? "" : "s"}
                    {(leagueFilter || teamFilter) && (byEvent[e]?.length ?? 0) !== moves.length
                      ? ` of ${byEvent[e]?.length ?? 0}`
                      : ""}
                  </span>
                  <span>{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div className="px-2 py-1 border border-t-0 border-rift-line/30">
                    {moves.length === 0 ? (
                      <div className="text-[10px] italic text-rift-muted py-0.5">
                        No transfers match these filters.
                      </div>
                    ) : (
                      moves.map((tr, i) => (
                        <TransferRow key={i} tr={tr} season={season} byId={byId} />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Demotions & roster entries (mid-split + post-Worlds offseason). */}
        {rosterNews.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setRosterNewsOpen((v) => !v)}
              aria-expanded={rosterNewsOpen}
              className="w-full flex items-center justify-between gap-2 mb-1 text-left"
            >
              <span className="text-[9px] uppercase tracking-[0.25em] text-emerald-300/70">
                Demotions &amp; Roster Entries{yr}
                <span className="ml-1.5 normal-case tracking-normal text-rift-muted/45 tabular-nums">
                  {filteredRosterNews.length}
                  {(leagueFilter || teamFilter || splitFilter) &&
                  filteredRosterNews.length !== rosterNews.length
                    ? ` of ${rosterNews.length}`
                    : ""}
                </span>
              </span>
              <span className="text-emerald-300/60 text-[10px] leading-none" aria-hidden>
                {rosterNewsOpen ? "▴" : "▾"}
              </span>
            </button>
            {rosterNewsOpen && (
            <div className="border border-emerald-500/25 bg-emerald-500/[0.04] divide-y divide-rift-line/15">
              {filteredRosterNews.length === 0 ? (
                <div className="px-2 py-1.5 text-[10px] italic text-rift-muted/55">
                  No roster news match these filters.
                </div>
              ) : (
              filteredRosterNews.map((n, i) => {
                const team = seasonTeam(season, n.teamId);
                const departed = n.departedName;
                const departedTier = n.departedTier;
                const departedAge = n.departedAge;
                const entrant = n.entrantName;
                const entrantTier = n.entrantTier;
                const entrantPotential = n.entrantPotential;
                const source = n.entrantSource;
                const vacancyDemote =
                  n.marketNote === "manual-demote" || n.marketNote === "ai-demote";
                const becameFa =
                  n.marketNote === "academy-release" ||
                  n.marketNote === "became-fa" ||
                  n.marketNote === "academy-bump";
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
                          : "";
                if (retired) {
                  return (
                    <div
                      key={`${n.teamId}-${n.lane}-${i}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 text-[10px]"
                    >
                      <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                        {n.timeMark ?? "—"}
                      </span>
                      <TeamIcon
                        iconKey={team?.iconKey ?? "shield"}
                        logoUrl={team?.logoUrl}
                        size={13}
                        color={team?.color}
                      />
                      <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                      <span className="text-rift-mutedbright">
                        <span className="text-rift-redbright/80">{departed ?? entrant}</span>{" "}
                        <span className="text-rift-muted/60">
                          ({departedTier ?? entrantTier}) retired
                          {departedAge != null ? ` · age ${departedAge}` : ""}
                        </span>
                      </span>
                    </div>
                  );
                }
                if (becameFa) {
                  const label =
                    n.marketNote === "academy-release"
                      ? "released to free agency"
                      : n.marketNote === "academy-bump"
                        ? "became a free agent (academy full)"
                        : "became a free agent";
                  return (
                    <div
                      key={`${n.teamId}-${n.lane}-${i}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 text-[10px]"
                    >
                      <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                        {n.timeMark ?? "—"}
                      </span>
                      <TeamIcon
                        iconKey={team?.iconKey ?? "shield"}
                        logoUrl={team?.logoUrl}
                        size={13}
                        color={team?.color}
                      />
                      <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                      <span className="text-rift-mutedbright">
                        <span className="text-amber-300/90">{departed ?? entrant}</span>{" "}
                        <span className="text-rift-muted/60">
                          ({departedTier ?? entrantTier}) {label}
                          {departedAge != null ? ` · age ${departedAge}` : ""}
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
                    <div
                      key={`${n.teamId}-${n.lane}-${i}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 text-[10px]"
                    >
                      <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                        {n.timeMark ?? "—"}
                      </span>
                      <TeamIcon
                        iconKey={team?.iconKey ?? "shield"}
                        logoUrl={team?.logoUrl}
                        size={13}
                        color={team?.color}
                      />
                      <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                      <span className="text-rift-mutedbright">
                        <span className="text-sky-400/90">{entrant}</span>{" "}
                        <span className="text-rift-muted/60">
                          ({entrantTier}) {academyLabel}
                        </span>
                      </span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`${n.teamId}-${n.lane}-${i}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 text-[10px]"
                  >
                    <span className="inline-flex items-center px-1 py-px border border-rift-line/40 text-[8px] uppercase tracking-[0.12em] text-rift-muted/55 shrink-0">
                      {n.timeMark ?? "—"}
                    </span>
                    <TeamIcon
                      iconKey={team?.iconKey ?? "shield"}
                      logoUrl={team?.logoUrl}
                      size={13}
                      color={team?.color}
                    />
                    <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
                    {departed ? (
                      <span className="text-rift-mutedbright">
                        <span className="text-rift-redbright/80">{departed}</span>{" "}
                        <span className="text-rift-muted/60">
                          ({departedTier}) demoted to academy
                          {departedAge != null ? ` · age ${departedAge}` : ""}
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
                            {entrant}
                          </span>
                        </span>
                        <span className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/60">
                          {entrantTier}
                          {entrantPotential !== entrantTier ? ` ↗${entrantPotential}` : ""}
                          {source === "rookie" ? " debuts" : " returns"}
                          {bidNote && (
                            <span className="normal-case tracking-normal text-rift-muted/50">{bidNote}</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                );
              })
              )}
            </div>
            )}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
