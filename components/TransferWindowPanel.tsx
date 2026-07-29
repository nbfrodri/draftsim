"use client";

import { useEffect, useMemo, useState } from "react";

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
  type InternationalId,
  type LeagueId,
  type PlayerTransfer,
  type SeasonState,
  type TransferPlayer,
} from "@/lib/season/types";
import {
  splitFromRosterTimeMark,
  visibleTransferDigestEvents,
  transferDigestSectionTitle,
  type RosterTimeSplit,
} from "@/lib/season/franchise";
import type { Champion, Lane } from "@/lib/types";
import { playerFromTransferSnapshot, findLivePlayerForCard } from "@/lib/season/playerCard";
import type { PlayerCardHint } from "./player/PlayerCardContext";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import TeamLogoLink from "./team/TeamLogoLink";
import LaneIcon from "./LaneIcon";
import { ChemScore, ProjectedChemScore } from "./ChemistryRow";
import InactiveMarketBoard from "./season/InactiveMarketBoard";
import VacancyFillPicker from "./season/VacancyFillPicker";
import AgencyDemandsPanel from "./season/AgencyDemandsPanel";
import RegionTeamFilters, {
  matchesTeamFilters,
  type FilterTeam,
} from "./season/RegionTeamFilters";
import PlayerNameLink from "./player/PlayerNameLink";
import TierChip from "./season/TierChip";
import RosterNewsRow, {
  classifyRosterNews,
  rosterNewsKindCounts,
  type RosterNewsItem,
  type RosterNewsKind,
} from "./season/RosterNewsRow";

// Transfer-window UI: the league-wide recap of roster moves at each window
// (after First Stand and MSI), plus the followed team's pending decisions with
// full player detail — skill tier, this split's grade, and champion pool. The
// season pauses on a transfer phase only while the user has decisions to make.

/** Chronological order for Demotions & Roster Entries section headers. */
const ROSTER_TIME_SORT: Record<string, number> = {
  Winter: 1,
  "First Stand window": 2,
  Spring: 3,
  "MSI window": 4,
  Summer: 5,
  "Worlds window": 6,
  Offseason: 7,
};

function groupRosterNewsByTime(items: readonly RosterNewsItem[]) {
  const groups = new Map<string, RosterNewsItem[]>();
  for (const n of items) {
    const key = n.timeMark?.trim() || "Unknown";
    const list = groups.get(key);
    if (list) list.push(n);
    else groups.set(key, [n]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const ra = ROSTER_TIME_SORT[a] ?? 50;
    const rb = ROSTER_TIME_SORT[b] ?? 50;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

type PanelTab = "yours" | "league";
type NewsKindFilter = RosterNewsKind | "all";

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; hint?: string; count?: number }[];
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-0.5 p-0.5 border border-rift-line/40 bg-rift-bg/50"
      role="tablist"
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          title={opt.hint}
          className={`px-2.5 py-1 text-[8px] uppercase tracking-[0.2em] transition-all ${
            value === opt.id
              ? "bg-rift-gold/12 border border-rift-gold/55 text-rift-goldbright shadow-[inset_0_1px_0_rgba(240,230,210,0.08)]"
              : "border border-transparent text-rift-mutedbright hover:text-rift-gold/85"
          }`}
        >
          {opt.label}
          {opt.count != null ? (
            <span className="ml-1 tabular-nums text-rift-muted/50">{opt.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function EmptyDigest({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="px-3 py-4 border border-dashed border-rift-line/35 bg-rift-bg/20 text-center">
      <div className="font-display text-[11px] tracking-wide text-rift-mutedbright/80">{title}</div>
      <div className="mt-1 text-[10px] italic text-rift-muted/55 max-w-sm mx-auto">{detail}</div>
    </div>
  );
}
const noteColor = (n: number | null) =>
  n == null ? "text-rift-muted/45" : n >= 7 ? "text-emerald-400" : n < 5.5 ? "text-rift-redbright" : "text-rift-mutedbright";
const fmtNote = (n: number | null) => (n == null ? "–" : n.toFixed(1));

/** Team logo with trading-card hover (desktop). */
function TransferTeamLogo({
  team,
  size = 14,
}: {
  team?: ReturnType<typeof seasonTeam>;
  size?: number;
}) {
  if (!team) {
    return (
      <span className="inline-flex shrink-0 text-rift-muted/50" title="—">
        —
      </span>
    );
  }
  return (
    <TeamLogoLink
      teamId={team.id}
      name={team.name}
      leagueId={team.leagueId}
      iconKey={team.iconKey}
      logoUrl={resolveTeamLogo(team.name, team.logoUrl)}
      color={team.color}
      size={size}
      hint={{ team }}
      renderAs="span"
    />
  );
}

// The qualifying-split the window's grades are drawn from, for the criteria note.
const WINDOW_SPLIT: Record<string, string> = {
  "first-stand": "Winter Split + First Stand",
  msi: "Spring Split + MSI",
};

// Skill tier + split grade + champion pool for one moving player.
function PlayerChip({
  p,
  byId,
  lane,
  hint,
}: {
  p: TransferPlayer;
  byId: Map<number, Champion>;
  lane: Lane;
  hint?: PlayerCardHint;
}) {
  const season = useDraftStore((s) => s.season);
  // Prefer the live roster / inactive row (same richness as Team Browser).
  // TransferPlayer snapshots only carry tier/grade/pool — never use them as the
  // card body when the player still exists in the season universe.
  const live = findLivePlayerForCard(season, {
    ...(p.id ? { playerId: p.id } : {}),
    ...(p.name ? { name: p.name } : {}),
    lane,
  });
  const cardHint: PlayerCardHint | undefined =
    hint ??
    (live
      ? {
          player: live.player,
          ...(live.teamName ? { teamName: live.teamName } : {}),
          lane: live.player.lane ?? lane,
        }
      : p.id
        ? { lane }
        : { player: playerFromTransferSnapshot(p, lane), lane });
  const playerId = p.id ?? live?.player.id;
  const displayName = p.name?.trim() || live?.player.name?.trim() || "Unknown";

  return (
    <span className="inline-flex items-center gap-1.5 align-middle min-w-0">
      <PlayerNameLink
        playerId={playerId}
        name={displayName}
        hint={cardHint}
        renderAs="span"
        title={displayName}
        className="text-[10px] text-rift-mutedbright font-medium max-w-[7.5rem] truncate cursor-pointer"
      />
      <TierChip tier={p.tier} size="xs" />
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
      className={`flex flex-col gap-1.5 text-[10px] px-2 py-2 min-h-[2.75rem] border-t border-rift-line/15 first:border-t-0 ${
        mine ? "bg-rift-blue/[0.06] border-l-2 border-l-rift-blue/50" : "border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 shrink-0">
        <LaneIcon lane={tr.lane} size="xs" />
        {mine && (
          <span className="px-1 border border-rift-blue/50 text-rift-bluebright text-[7px] uppercase tracking-[0.2em]">
            You
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-rift-mutedbright">
          <TransferTeamLogo team={from} />
          <span className="text-rift-gold/60" aria-hidden>
            →
          </span>
          <TransferTeamLogo team={to} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-emerald-500/30 bg-emerald-500/[0.06]">
          <span className="text-[7px] uppercase tracking-[0.12em] text-emerald-400/70 shrink-0">In</span>
          <PlayerChip p={tr.star} byId={byId} lane={tr.lane} />
        </span>
        <span className="text-rift-muted/35 shrink-0" aria-hidden>
          ⇄
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-rift-red/25 bg-rift-red/[0.04]">
          <span className="text-[7px] uppercase tracking-[0.12em] text-rift-redbright/70 shrink-0">Out</span>
          <PlayerChip p={tr.swap} byId={byId} lane={tr.lane} />
        </span>
      </div>
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
  const [panelTab, setPanelTab] = useState<PanelTab>("yours");
  const [newsKindFilter, setNewsKindFilter] = useState<NewsKindFilter>("all");

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

  const byEvent = season?.transfersByEvent ?? {};
  const windows = useMemo(() => {
    if (!season) return [] as InternationalId[];
    return visibleTransferDigestEvents(season);
  }, [season?.transfersByEvent, season?.phases, season?.status, season?.updatedAt]);

  const preferredWindow: InternationalId | null = useMemo(() => {
    if (atWindow && phase?.event && windows.includes(phase.event)) return phase.event;
    // Offseason shop / season complete: prefer Post Worlds when it has moves.
    if (season?.status === "complete" && windows.includes("worlds")) return "worlds";
    // Mid next year with only prior-Worlds carry (or Worlds last among played).
    if (windows.includes("msi")) return "msi";
    if (windows.includes("first-stand")) return "first-stand";
    return windows.includes("worlds")
      ? "worlds"
      : (windows[windows.length - 1] ?? null);
  }, [atWindow, phase?.event, windows, season?.status]);

  const windowsKey = windows.join("|");
  useEffect(() => {
    if (!preferredWindow) return;
    // Sync open accordion to the preferred window (active transfer phase, else
    // MSI > First Stand > Worlds). length>1 used to leave every section closed.
    setOpenEvent((prev) => (prev === "__none__" ? prev : preferredWindow));
  }, [preferredWindow, windowsKey]);

  if (!season || !season.config.playerTransfers) return null;

  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const academyCount =
    controlled && season.franchise?.aging
      ? countTeamAcademy(season.franchise.inactivePool ?? [], controlled.id)
      : 0;
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

  const baseFilteredRosterNews = rosterNews.filter((n) => {
    if (!matchesTeamFilters(n.teamId, teamsById, leagueFilter, teamFilter)) {
      return false;
    }
    const derivedSplit = splitFromRosterTimeMark(n.timeMark);
    // Prefer to show the "Offseason roster move" only at the real end of
    // the year (after Worlds), not at the start of the next year.
    if (derivedSplit === "offseason" && season?.status !== "complete") {
      return false;
    }
    if (splitFilter && derivedSplit !== splitFilter) {
      return false;
    }
    return true;
  });

  const filteredRosterNews =
    newsKindFilter === "all"
      ? baseFilteredRosterNews
      : baseFilteredRosterNews.filter(
          (n) => classifyRosterNews(n) === newsKindFilter,
        );
  const rosterNewsGroups = groupRosterNewsByTime(filteredRosterNews);
  const newsCounts = rosterNewsKindCounts(baseFilteredRosterNews);

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
    <div className="mb-8 border border-rift-gold/30 bg-rift-gold/[0.03] overflow-visible">
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
      <div className="min-h-0 overflow-visible">
      {atWindow && (
        <div className="px-3 pt-2.5 pb-2 border-b border-rift-gold/15 flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={panelTab}
            onChange={setPanelTab}
            options={[
              {
                id: "yours",
                label: "Your team",
                hint: "Pending offers, roster shop, FA & academy",
              },
              {
                id: "league",
                label: "League digest",
                count:
                  windows.reduce((n, e) => n + (byEvent[e]?.length ?? 0), 0) +
                  rosterNews.length,
                hint: "Completed swaps and roster moves league-wide",
              },
            ]}
          />
          {panelTab === "yours" && controlled && (
            <span className="ml-auto text-[8px] uppercase tracking-[0.18em] text-rift-muted/50 truncate max-w-[12rem]">
              {controlled.name}
            </span>
          )}
        </div>
      )}

      {/* Followed team's pending decisions */}
      {atWindow && panelTab === "yours" && (
        <div className="px-3 py-2 border-b border-rift-gold/20 bg-rift-gold/[0.04] min-h-0">
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
            <div className="text-[10px] italic text-rift-muted mb-2 px-2 py-1.5 border border-dashed border-rift-line/30">
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
                    className="border border-rift-gold/25 bg-rift-bg/30 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <LaneIcon lane={pr.lane} size="sm" className="shrink-0" />
                      <TransferTeamLogo team={other} size={16} />
                      <span
                        className={`px-1.5 py-px border text-[7px] uppercase tracking-[0.14em] ${
                          incoming
                            ? "border-emerald-500/40 text-emerald-300/90 bg-emerald-500/10"
                            : "border-rift-red/35 text-rift-redbright/80 bg-rift-red/[0.06]"
                        }`}
                      >
                        {incoming ? "Incoming offer" : "Poach attempt"}
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
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 px-1.5 py-1 border border-emerald-500/25 bg-emerald-500/[0.04]">
                        <span className="text-[7px] uppercase tracking-[0.14em] text-emerald-400/70 shrink-0 w-6">In</span>
                        <PlayerChip p={pr.theirs} byId={byId} lane={pr.lane} />
                      </div>
                      <div className="flex items-center gap-2 px-1.5 py-1 border border-rift-red/25 bg-rift-red/[0.04]">
                        <span className="text-[7px] uppercase tracking-[0.14em] text-rift-redbright/70 shrink-0 w-6">Out</span>
                        <PlayerChip p={pr.mine} byId={byId} lane={pr.lane} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Shop your roster — pick a slot, see who's tradeable for it */}
          {controlled && (
            <div className="mb-2 border-t border-rift-gold/15 pt-2">
              <div className="mb-2">
                <AgencyDemandsPanel />
              </div>
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
                    <div
                      key={lane}
                      className={`border border-rift-line/30 bg-rift-bg/20 ${
                        vacant ? "border-l-2 border-l-amber-500/50" : movedLanes.has(lane) ? "border-l-2 border-l-emerald-500/45" : "border-l-2 border-l-rift-gold/25"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[10px] px-2 py-1.5">
                        <LaneIcon lane={lane} size="sm" className="shrink-0" />
                        {vacant ? (
                          <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] text-amber-300/85">
                            <span className="px-1 py-px border border-amber-500/40 text-[7px]">Vacant</span>
                            Academy · FA · Rookie
                          </span>
                        ) : (
                          <>
                            <PlayerChip
                              p={{
                                ...(p.id ? { id: p.id } : {}),
                                name: p.name,
                                tier: p.tier,
                                grade: null,
                                goodChamps: p.goodChamps,
                              }}
                              byId={byId}
                              lane={lane}
                              hint={{ player: p, teamName: controlled.name, lane }}
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
                        <div className="mx-2 mb-1.5 space-y-1 border-t border-rift-line/20 pt-1.5">
                          {willing.length === 0 ? (
                            <div className="text-[9px] italic text-rift-muted px-1">
                              No team will trade for this slot right now.
                            </div>
                          ) : (
                            willing.slice(0, 6).map((c) => {
                              const other = seasonTeam(season, c.otherTeamId);
                              const incoming = other?.players[li];
                              return (
                                <div
                                  key={c.otherTeamId}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] px-1.5 py-1 border border-rift-line/25 bg-rift-bg/30"
                                >
                                  <TransferTeamLogo team={other} size={14} />
                                  <PlayerChip p={c.theirs} byId={byId} lane={lane} />
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

      {/* League digest — transfers + roster timeline */}
      {(!atWindow || panelTab === "league") && (
      <div className="px-3 py-2 min-h-0">
        <div className="-mx-3 px-3 py-2 mb-2 border-b border-rift-line/25 bg-[#010a13]/92 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/60">
              League digest{yr}
            </span>
            {(windows.length > 0 || rosterNews.length > 0) && (
              <span className="text-[8px] text-rift-muted/45 tabular-nums">
                {windows.reduce((n, e) => n + (byEvent[e]?.length ?? 0), 0)} swaps ·{" "}
                {rosterNews.length} roster
              </span>
            )}
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
          {rosterNews.length > 0 && (
            <SegmentedControl
              value={newsKindFilter}
              onChange={setNewsKindFilter}
              options={[
                { id: "all", label: "All moves", count: baseFilteredRosterNews.length },
                ...(newsCounts.roster > 0 ? [{ id: "swap" as const, label: "Signings", count: newsCounts.roster }] : []),
                ...(newsCounts.pending > 0 ? [{ id: "demote-pending" as const, label: "Open slots", count: newsCounts.pending }] : []),
                ...(newsCounts.freeAgent > 0 ? [{ id: "free-agent" as const, label: "FA", count: newsCounts.freeAgent }] : []),
                ...(newsCounts.academy > 0 ? [{ id: "academy-sign" as const, label: "Academy", count: newsCounts.academy }] : []),
                ...(newsCounts.retire > 0 ? [{ id: "retire" as const, label: "Retired", count: newsCounts.retire }] : []),
              ]}
            />
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start min-h-0">
          {/* Completed cross-team swaps */}
          <section className="min-w-0 border border-rift-line/35 bg-rift-bg/25 overflow-visible">
            <div className="px-2.5 py-1.5 border-b border-rift-line/30 flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-[0.22em] text-rift-gold/65">
                Transfers
              </span>
              {(atWindow || windows.length > 0) && (
                <span className="text-[7px] uppercase tracking-[0.12em] text-rift-muted/45 truncate">
                  Valued on{" "}
                  {(
                    WINDOW_SPLIT[(phase?.event as string) ?? windows[0] ?? "first-stand"] ??
                    "recent split"
                  )
                    .split("+")
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
            <div className="p-2 overflow-visible">
              {windows.length === 0 ? (
                atWindow ? (
                  <EmptyDigest
                    title="No completed swaps yet"
                    detail="Cross-team trades show up here once clubs finalize moves this window."
                  />
                ) : (
                  <EmptyDigest
                    title="No transfer history"
                    detail="Completed swaps from this window will appear in the digest."
                  />
                )
              ) : (
                windows.map((e) => {
                  const moves = (byEvent[e] ?? []).filter(transferMatchesFilter);
                  const isOpen =
                    openEvent === e ||
                    (openEvent == null && e === preferredWindow) ||
                    (windows.length === 1 && openEvent !== "__none__");
                  return (
                    <div key={e} className="mb-1.5 last:mb-0">
                      <button
                        type="button"
                        onClick={() => setOpenEvent(isOpen ? "__none__" : (e as string))}
                        className="w-full flex items-center justify-between px-2 py-1 border border-rift-line/40 bg-rift-bg/30 text-[9px] uppercase tracking-[0.2em] text-rift-mutedbright hover:text-rift-goldbright transition-all"
                      >
                        <span>
                          {transferDigestSectionTitle(e, season)} — {moves.length} move
                          {moves.length === 1 ? "" : "s"}
                          {(leagueFilter || teamFilter) &&
                          (byEvent[e]?.length ?? 0) !== moves.length
                            ? ` of ${byEvent[e]?.length ?? 0}`
                            : ""}
                        </span>
                        <span>{isOpen ? "▴" : "▾"}</span>
                      </button>
                      {isOpen && (
                        <div className="border border-t-0 border-rift-line/30 overflow-visible">
                          {moves.length === 0 ? (
                            <div className="px-2 py-2 text-[10px] italic text-rift-muted/55">
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
            </div>
          </section>

          {/* Demotions, debuts, retirements */}
          <section className="min-w-0 border border-emerald-500/25 bg-emerald-500/[0.03]">
            <button
              type="button"
              onClick={() => setRosterNewsOpen((v) => !v)}
              aria-expanded={rosterNewsOpen}
              className="w-full px-2.5 py-1.5 border-b border-emerald-500/20 flex items-center justify-between gap-2 text-left hover:bg-emerald-500/[0.04] transition-colors"
            >
              <div className="min-w-0">
                <span className="text-[9px] uppercase tracking-[0.22em] text-emerald-300/75">
                  Roster moves
                </span>
                <span className="ml-1.5 text-[8px] text-rift-muted/45 tabular-nums">
                  {filteredRosterNews.length}
                  {(leagueFilter || teamFilter || splitFilter || newsKindFilter !== "all") &&
                  filteredRosterNews.length !== rosterNews.length
                    ? ` / ${rosterNews.length}`
                    : ""}
                </span>
              </div>
              <span className="text-emerald-300/60 text-[10px] leading-none shrink-0" aria-hidden>
                {rosterNewsOpen ? "▴" : "▾"}
              </span>
            </button>
            {rosterNewsOpen && (
              <div>
                {rosterNews.length === 0 ? (
                  <EmptyDigest
                    title="No roster churn yet"
                    detail="Demotions, debuts, academy stash, and retirements land here as the window progresses."
                  />
                ) : filteredRosterNews.length === 0 ? (
                  <div className="px-2.5 py-3 text-[10px] italic text-rift-muted/55">
                    No roster moves match the current filters.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rosterNewsGroups.map(([timeMark, items]) => (
                      <div key={timeMark}>
                        <div className="px-2.5 py-1 border-b border-rift-line/20 bg-rift-bg/25 flex items-center gap-2">
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 shrink-0"
                            aria-hidden
                          />
                          <span className="text-[8px] uppercase tracking-[0.2em] text-rift-gold/60 flex-1 truncate">
                            {timeMark}
                          </span>
                          <span className="text-[8px] text-rift-muted/45 tabular-nums shrink-0">
                            {items.length}
                          </span>
                        </div>
                        <div className="divide-y divide-rift-line/12 max-h-[28rem] overflow-y-auto">
                          {items.map((n, i) => {
                            const team = seasonTeam(season, n.teamId);
                            const highlight = !!controlledId && n.teamId === controlledId;
                            return (
                              <RosterNewsRow
                                key={`${n.teamId}-${n.lane}-${timeMark}-${i}`}
                                item={n}
                                team={
                                  team
                                    ? {
                                        name: team.name,
                                        iconKey: team.iconKey,
                                        logoUrl: resolveTeamLogo(team.name, team.logoUrl),
                                        color: team.color,
                                      }
                                    : undefined
                                }
                                highlight={highlight}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
      )}
      </div>
      )}
    </div>
  );
}
