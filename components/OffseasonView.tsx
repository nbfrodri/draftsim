"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { MAIN_POOL } from "@/lib/players";
import {
  activeWindowTransfers,
  offseasonCandidates,
  userTransferCount,
  USER_MAX_TRANSFERS_OFFSEASON,
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
import { coachPlaystyle } from "@/lib/season/coach";
import { computeSeasonStats } from "@/lib/season/stats";
import { intlConfigFor } from "@/lib/season/engine";
import {
  seasonTeam,
  LEAGUE_IDS,
  type InternationalId,
  type LeagueId,
  type SeasonIntlConfig,
  type SeasonLeagueConfig,
  type SeasonTeam,
} from "@/lib/season/types";
import type { Champion, Lane, PlayerTier } from "@/lib/types";
import TeamNameLink from "./team/TeamNameLink";
import LaneIcon from "./LaneIcon";
import { ProjectedChemScore } from "./ChemistryRow";
import { LeagueConfigCard, IntlConfigCard, GlobalCupConfigCard, INTL_IDS } from "./season/configCards";
import TeamPicker from "./season/TeamPicker";
import InactiveMarketBoard from "./season/InactiveMarketBoard";
import VacancyFillPicker from "./season/VacancyFillPicker";
import AgencyDemandsPanel from "./season/AgencyDemandsPanel";
import PlayerNameLink from "./player/PlayerNameLink";
import CoachNameLink from "./coach/CoachNameLink";

// The post-Worlds OFFSEASON for a reality: the year is decided, and before
// rolling into the next one the user sees the season's headline stats and runs
// their team's biggest transfer window — then finalizes (aging + the rest of
// the league's offseason auto-resolves on the way to next year).

const LANE_ORDER: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

export default function OffseasonView() {
  const season = useDraftStore((s) => s.season);
  const champions = useDraftStore((s) => s.champions);
  const shopOffseasonTransfer = useDraftStore((s) => s.shopOffseasonTransfer);
  const shopOffseasonFa = useDraftStore((s) => s.shopOffseasonFa);
  const shopFaToAcademy = useDraftStore((s) => s.shopFaToAcademy);
  const shopAcademyRecall = useDraftStore((s) => s.shopAcademyRecall);
  const shopAcademyRelease = useDraftStore((s) => s.shopAcademyRelease);
  const shopAcademyRookie = useDraftStore((s) => s.shopAcademyRookie);
  const shopRookie = useDraftStore((s) => s.shopRookie);
  const demoteFollowedPlayer = useDraftStore((s) => s.demoteFollowedPlayer);
  const shopOffseasonCoach = useDraftStore((s) => s.shopOffseasonCoach);
  const aiDecideOffseason = useDraftStore((s) => s.aiDecideOffseason);
  const updateSeasonConfig = useDraftStore((s) => s.updateSeasonConfig);
  const continueSeasonToNextYear = useDraftStore((s) => s.continueSeasonToNextYear);
  const [shopLane, setShopLane] = useState<Lane | null>(null);
  const [confirmDemoteLane, setConfirmDemoteLane] = useState<Lane | null>(null);
  const [fillLane, setFillLane] = useState<Lane | null>(null);
  const [boardFocus, setBoardFocus] = useState<{ kind: "fa" | "academy"; lane: Lane } | null>(
    null,
  );
  const [coachOpen, setCoachOpen] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);

  // This component is mounted throughout the live season but renders nothing
  // until the offseason. `computeSeasonStats` is O(every game in the season),
  // so gate it on `active` — otherwise it recomputes the whole season on every
  // sim tick while showing nothing, which visibly slows simulations.
  const active = !!season?.franchise && season.status === "complete";
  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c] as const)), [champions]);
  const stats = useMemo(() => (active && season ? computeSeasonStats(season) : null), [active, season]);
  const byLeague = useMemo(() => {
    const map = new Map<LeagueId, SeasonTeam[]>();
    for (const l of LEAGUE_IDS) map.set(l, []);
    for (const t of season?.teams ?? []) map.get(t.leagueId)?.push(t);
    return map;
  }, [season?.teams]);
  const candidates = useMemo(
    () => (active && season && shopLane ? offseasonCandidates(season, champions, shopLane) : []),
    [active, season, champions, shopLane],
  );
  const controlledId = season?.config.controlledTeamId;
  const faBoard = useMemo(() => {
    if (!active || !season || !controlledId) return [];
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
  }, [active, season, controlledId, byId]);
  const faRecommended = useMemo(() => {
    if (!active || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    const exclude = new Set(season.franchise?.sameWindowDemoteIds ?? []);
    return recommendedFasForTeam(
      season.franchise?.inactivePool ?? [],
      team.players,
      byId,
      season.currentMeta,
    ).filter((r) => !r.entry.player.id || !exclude.has(r.entry.player.id));
  }, [active, season, controlledId, byId]);
  const academyBoard = useMemo(() => {
    if (!active || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    // Include same-window demotees on the board; block call-up separately.
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
  }, [active, season, controlledId, byId]);
  const sameWindowDemoteIds = useMemo(
    () => new Set(season?.franchise?.sameWindowDemoteIds ?? []),
    [season?.franchise?.sameWindowDemoteIds],
  );
  const academyRecommended = useMemo(() => {
    if (!active || !season || !controlledId) return [];
    const team = seasonTeam(season, controlledId);
    if (!team) return [];
    return recommendedAcademyForTeam(
      season.franchise?.inactivePool ?? [],
      controlledId,
      team.players,
      byId,
      season.currentMeta,
    ).filter((r) => !r.entry.player.id || !sameWindowDemoteIds.has(r.entry.player.id));
  }, [active, season, controlledId, byId, sameWindowDemoteIds]);

  if (!active || !season) return null;

  const fr = season.franchise!; // guaranteed by `active`
  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const academyCount = controlled
    ? countTeamAcademy(fr.inactivePool ?? [], controlled.id)
    : 0;
  const championTeam = seasonTeam(season, season.champion);
  const movedLanes = new Set<Lane>();
  if (controlled) {
    for (const m of activeWindowTransfers(season, "worlds")) {
      if (m.fromTeamId === controlled.id || m.toTeamId === controlled.id) movedLanes.add(m.lane);
    }
  }
  // Per-window transfer cap ("worlds" is the offseason window key).
  const usedCount = controlled ? userTransferCount(season, "worlds", controlled.id) : 0;
  const capReached = usedCount >= USER_MAX_TRANSFERS_OFFSEASON;
  const leaders = stats?.playerLeaders;

  return (
    <div className="mb-8 border-2 border-rift-gold/40 bg-rift-gold/[0.04]">
      <div className="px-3 py-2 border-b border-rift-gold/30 flex items-center gap-2 flex-wrap">
        <span className="font-display text-base tracking-wider text-rift-goldbright">
          Offseason
        </span>
        <span className="text-[9px] uppercase tracking-[0.3em] text-rift-muted/60">
          {fr.name} · Year {fr.year} complete
        </span>
        {championTeam && (
          <TeamNameLink
            teamId={championTeam.id}
            name={championTeam.name}
            leagueId={championTeam.leagueId}
            iconKey={championTeam.iconKey}
            logoUrl={championTeam.logoUrl}
            color={championTeam.color}
            logoSize={16}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-rift-bluebright"
            hint={{ team: championTeam }}
          >
            {championTeam.name} — World Champion
          </TeamNameLink>
        )}
      </div>

      {/* Season headline stats */}
      {leaders && (
        <div className="px-3 py-2 border-b border-rift-gold/15 grid grid-cols-2 md:grid-cols-4 gap-2">
          {([
            ["MVPs", leaders.byMVP, (l: (typeof leaders.byMVP)[number]) => `${l.mvps}`],
            ["Kills", leaders.byKills, (l: (typeof leaders.byKills)[number]) => `${l.kills}`],
            ["Rating", leaders.byRating, (l: (typeof leaders.byRating)[number]) => (l.avgRating ?? 0).toFixed(1)],
            ["Pentas", leaders.byPentakills, (l: (typeof leaders.byPentakills)[number]) => `${l.pentakills}`],
          ] as const).map(([label, rows, val]) =>
            rows[0] ? (
              <div key={label} className="border border-rift-line/40 bg-rift-bg/30 px-2 py-1">
                <div className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/55">{label} leader</div>
                <div className="flex items-baseline gap-1 text-[10px] text-rift-mutedbright truncate">
                  <PlayerNameLink
                    playerId={rows[0].playerId}
                    name={rows[0].playerName || rows[0].teamName}
                    className="truncate"
                  />
                  <span className="text-rift-goldbright font-display">{val(rows[0])}</span>
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* Shop your roster — the biggest window of the year */}
      {controlled && season.config.playerTransfers && (
        <div className="px-3 py-2">
          <div className="mb-2">
            <AgencyDemandsPanel />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
              Shop your roster — biggest window of the year
            </span>
            <button
              type="button"
              onClick={() => aiDecideOffseason()}
              className="ml-auto px-2 py-0.5 border border-rift-blue/50 text-rift-bluebright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-blue/10 transition-all"
              title="Let the AI shop upgrades, bench weak lanes for FA/academy fills, and hire a better coach"
            >
              Let AI decide
            </button>
            <span
              className={`text-[8px] uppercase tracking-[0.2em] tabular-nums ${capReached ? "text-rift-redbright/80" : "text-rift-muted/60"}`}
              title={`Up to ${USER_MAX_TRANSFERS_OFFSEASON} transfers, one per role`}
            >
              {usedCount}/{USER_MAX_TRANSFERS_OFFSEASON} signed
            </span>
            {fr.aging && (
              <span
                className={`text-[8px] uppercase tracking-[0.2em] tabular-nums ${
                  (fr.manualDemotesThisWindow ?? 0) >= USER_MAX_MANUAL_DEMOTES
                    ? "text-rift-redbright/80"
                    : "text-rift-muted/60"
                }`}
                title={`Up to ${USER_MAX_MANUAL_DEMOTES} manual demotes to academy per window`}
              >
                {fr.manualDemotesThisWindow ?? 0}/{USER_MAX_MANUAL_DEMOTES} demoted
              </span>
            )}
          </div>
          <div className="space-y-1">
            {LANE_ORDER.map((lane, li) => {
              const p = controlled.players[li];
              if (!p) return null;
              const vacant = isRosterVacancy(p);
              const open = shopLane === lane;
              const moved = movedLanes.has(lane);
              const willing = candidates.filter((c) => c.willing);
              const demoteCap =
                !fr.aging || (fr.manualDemotesThisWindow ?? 0) >= USER_MAX_MANUAL_DEMOTES;
              const sameWindowRookie =
                !!p.id && (fr.sameWindowRookieIds ?? []).includes(p.id);
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
                        <span className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}>{p.tier}</span>
                        {p.name && (
                          <PlayerNameLink
                            playerId={p.id}
                            name={p.name}
                            hint={{ player: p, teamName: controlled.name }}
                            title={p.name}
                            className="text-rift-mutedbright font-medium max-w-[110px] truncate"
                          />
                        )}
                        <span className="inline-flex gap-0.5">
                          {p.goodChamps.slice(0, 3).map((id, i) => {
                            const c = byId.get(id);
                            if (!c) return null;
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={id} src={c.iconUrl} alt={c.name} className={`w-4 h-4 object-cover border border-rift-line/40 ${i >= MAIN_POOL ? "opacity-50" : ""}`} />
                            );
                          })}
                        </span>
                      </>
                    )}
                    {moved ? (
                      <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-emerald-400/80">✓ signed</span>
                    ) : vacant ? (
                      <button
                        type="button"
                        onClick={() => setFillLane(fillLane === lane ? null : lane)}
                        className="ml-auto px-2 py-0.5 border border-amber-500/40 text-amber-200/90 text-[8px] uppercase tracking-[0.2em] hover:border-amber-400/70 hover:bg-amber-500/10 transition-all"
                      >
                        {fillLane === lane ? "Close fill" : "Fill slot"}
                      </button>
                    ) : capReached ? (
                      <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-rift-muted/50">cap reached</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShopLane(open ? null : lane)}
                        className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
                      >
                        {open ? "Close" : "Find transfers"}
                      </button>
                    )}
                    {fr.aging && !vacant && !moved && (
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
                  {vacant && fillLane === lane && fr.aging && (
                    <VacancyFillPicker
                      lane={lane}
                      academyRows={academyBoard.filter(
                        (r) =>
                          r.entry.player.lane === lane &&
                          (!r.entry.player.id || !sameWindowDemoteIds.has(r.entry.player.id)),
                      )}
                      faRows={faBoard.filter((r) => r.entry.player.lane === lane)}
                      signsUsed={fr.faSignsThisWindow ?? 0}
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
                  {open && !moved && !vacant && (
                    <div className="ml-8 mt-1 space-y-1">
                      {willing.length === 0 ? (
                        <div className="text-[9px] italic text-rift-muted">No team will trade for this slot.</div>
                      ) : (
                        willing.slice(0, 6).map((c) => {
                          const other = seasonTeam(season, c.otherTeamId);
                          const incoming = other?.players[li];
                          return (
                            <div key={c.otherTeamId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                              <TeamNameLink
                                teamId={other?.id}
                                name={other?.name}
                                leagueId={other?.leagueId}
                                iconKey={other?.iconKey ?? "shield"}
                                logoUrl={other?.logoUrl}
                                color={other?.color}
                                logoSize={12}
                                className="inline-flex items-center gap-1 text-rift-mutedbright min-w-0 max-w-[120px]"
                                hint={other ? { team: other } : undefined}
                              />
                              <span className={`w-5 text-center border font-display ${TIER_CLS[c.theirs.tier]}`}>{c.theirs.tier}</span>
                              {c.theirs.name && (
                                <PlayerNameLink
                                  playerId={c.theirs.id}
                                  name={c.theirs.name}
                                  className="truncate max-w-[88px] text-rift-mutedbright"
                                />
                              )}
                              {incoming && (
                                <ProjectedChemScore roster={controlled.players} incoming={incoming} lane={lane} />
                              )}
                              <span className={`text-[9px] tabular-nums ${c.upgrade > 0.05 ? "text-emerald-400" : c.upgrade < -0.05 ? "text-rift-redbright" : "text-rift-muted/60"}`}>
                                {c.upgrade >= 0 ? "+" : ""}
                                {c.upgrade.toFixed(1)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  shopOffseasonTransfer(lane, c.otherTeamId);
                                  setShopLane(null);
                                }}
                                className="ml-auto px-2 py-0.5 border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                              >
                                Sign
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

      {/* Free-agent + Academy boards — user shops before AI market on continue */}
      {controlled && fr.aging && (
        <div className="px-3 py-2">
          <InactiveMarketBoard
            kind="fa"
            board={faBoard}
            recommended={faRecommended}
            signsUsed={fr.faSignsThisWindow ?? 0}
            academyCount={academyCount}
            onSign={shopOffseasonFa}
            onSignToAcademy={shopFaToAcademy}
            focusLane={boardFocus?.kind === "fa" ? boardFocus.lane : null}
          />
          <InactiveMarketBoard
            kind="academy"
            board={academyBoard}
            recommended={academyRecommended}
            signsUsed={fr.faSignsThisWindow ?? 0}
            academyCount={academyCount}
            onSign={shopAcademyRecall}
            onReleaseToFa={shopAcademyRelease}
            onAddAcademyRookie={() => shopAcademyRookie()}
            blockedCallUpIds={sameWindowDemoteIds}
            focusLane={boardFocus?.kind === "academy" ? boardFocus.lane : null}
          />
        </div>
      )}

      {/* Coach market — coaches only change between years. Swap yours for a
          rival's: the other team takes your old coach in return. */}
      {controlled && (
        <div className="px-3 py-2 border-t border-rift-gold/15">
          <div className="flex items-center gap-2 text-[10px] mb-1">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">Coach</span>
            {controlled.coach ? (
              <span className="text-rift-mutedbright font-medium inline-flex items-center min-w-0">
                <CoachNameLink
                  name={controlled.coach.name}
                  hint={{ coach: controlled.coach, team: controlled }}
                  className="truncate"
                />
                <span className="text-rift-gold/80 ml-1.5 tabular-nums">★{controlled.coach.rating.toFixed(1)}</span>
                <span className="text-rift-muted/60 ml-1.5">{coachPlaystyle(controlled.coach)}</span>
              </span>
            ) : (
              <span className="italic text-rift-muted">No coach</span>
            )}
            <button
              type="button"
              onClick={() => setCoachOpen((v) => !v)}
              className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
            >
              {coachOpen ? "Close" : "Find coach"}
            </button>
          </div>
          {coachOpen && (
            <div className="ml-2 mt-1 space-y-1">
              {season.teams
                .filter((t) => t.id !== controlled.id && t.coach)
                .sort((a, b) => (b.coach!.rating - a.coach!.rating))
                .slice(0, 8)
                .map((t) => {
                  const better = (t.coach!.rating - (controlled.coach?.rating ?? 0));
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                      <TeamNameLink
                        teamId={t.id}
                        name={t.name}
                        leagueId={t.leagueId}
                        iconKey={t.iconKey}
                        logoUrl={t.logoUrl}
                        color={t.color}
                        logoSize={12}
                        className="inline-flex items-center gap-1 text-rift-mutedbright min-w-0 max-w-[120px]"
                        hint={{ team: t }}
                      />
                      <CoachNameLink
                        name={t.coach!.name}
                        hint={{ coach: t.coach!, team: t }}
                        className="text-rift-mutedbright truncate max-w-[88px]"
                      />
                      <span className="text-rift-gold/80 tabular-nums">★{t.coach!.rating.toFixed(1)}</span>
                      <span className="text-rift-muted/60 truncate max-w-[80px]">{coachPlaystyle(t.coach)}</span>
                      <span className={`text-[9px] tabular-nums ${better > 0.05 ? "text-emerald-400" : better < -0.05 ? "text-rift-redbright" : "text-rift-muted/60"}`}>
                        {better >= 0 ? "+" : ""}
                        {better.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          shopOffseasonCoach(t.id);
                          setCoachOpen(false);
                        }}
                        className="ml-auto px-2 py-0.5 border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] hover:bg-rift-gold/20 transition-all"
                      >
                        Hire
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Next-year formats — full split/international editor (same controls as
          New Season). Edits the carried-forward config; startNextSeason uses it. */}
      {(() => {
        const cfg = season.config;
        const shared = cfg.sharedLeagueConfig !== false;
        const setLeagueOne = (league: LeagueId, patch: Partial<SeasonLeagueConfig>) =>
          updateSeasonConfig({
            leagueConfigs: {
              ...cfg.leagueConfigs,
              [league]: { ...cfg.leagueConfigs[league], ...patch },
            },
          });
        const setLeagueAll = (patch: Partial<SeasonLeagueConfig>) => {
          const merged = { ...cfg.leagueConfigs.LCK, ...patch };
          updateSeasonConfig({
            sharedLeagueConfig: true,
            leagueConfigs: Object.fromEntries(
              LEAGUE_IDS.map((l) => [l, { ...merged }]),
            ) as Record<LeagueId, SeasonLeagueConfig>,
          });
        };
        const setIntl = (e: InternationalId, patch: Partial<SeasonIntlConfig>) =>
          updateSeasonConfig({
            intlConfigs: {
              ...cfg.intlConfigs,
              [e]: { ...intlConfigFor(cfg, e), ...patch },
            },
          });
        const toggleClass = (on: boolean) =>
          `px-2 py-0.5 border text-[8px] uppercase tracking-[0.2em] transition-all ${
            on
              ? "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
              : "border-rift-line text-rift-mutedbright hover:text-rift-goldbright"
          }`;
        return (
          <div className="px-3 py-2 border-t border-rift-gold/15">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
                Next-year formats
              </span>
              <button
                type="button"
                onClick={() => setFmtOpen((v) => !v)}
                className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
              >
                {fmtOpen ? "Close" : "Change formats"}
              </button>
            </div>
            {fmtOpen && (
              <div className="space-y-3 mt-1">
                {/* League splits */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/55">
                      Splits
                    </span>
                    <button
                      type="button"
                      onClick={() => updateSeasonConfig({ sharedLeagueConfig: !shared })}
                      className={toggleClass(shared)}
                    >
                      {shared ? "Shared: all leagues" : "Per-league"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {shared ? (
                      <LeagueConfigCard
                        label="All Leagues"
                        cfg={cfg.leagueConfigs.LCK}
                        onChange={setLeagueAll}
                      />
                    ) : (
                      LEAGUE_IDS.map((l) => (
                        <LeagueConfigCard
                          key={l}
                          label={l}
                          cfg={cfg.leagueConfigs[l]}
                          onChange={(p) => setLeagueOne(l, p)}
                        />
                      ))
                    )}
                  </div>
                </div>
                {/* Internationals */}
                <div>
                  <div className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/55 mb-1">
                    Internationals
                  </div>
                  <div className="space-y-2">
                    {INTL_IDS.map((e) => (
                      <IntlConfigCard
                        key={e}
                        event={e}
                        cfg={intlConfigFor(cfg, e)}
                        onChange={(p) => setIntl(e, p)}
                      />
                    ))}
                    <GlobalCupConfigCard
                      cfg={intlConfigFor(cfg, "global-cup")}
                      onChange={(p) => setIntl("global-cup", p)}
                    />
                  </div>
                </div>
                <p className="text-[8px] text-rift-muted/55">
                  Applies to next year. Same controls as New Season.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Spectate vs follow — per-year role before rolling forward */}
      <div className="px-3 py-2 border-t border-rift-gold/15">
        <div className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70 mb-1">
          Your role · Year {fr.year + 1}
        </div>
        <p className="text-[8px] text-rift-muted/55 mb-2">
          Spectate the full sim, or follow one team for play / watch on their matches and the offseason shop.
        </p>
        <TeamPicker
          byLeague={byLeague}
          value={season.config.controlledTeamId}
          onChange={(teamId) => updateSeasonConfig({ controlledTeamId: teamId })}
        />
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => continueSeasonToNextYear()}
          className="w-full py-2 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[11px] uppercase tracking-[0.3em] hover:bg-rift-gold/20 transition-all"
        >
          Finalize Offseason → Year {fr.year + 1}
        </button>
        <p className="text-[8px] text-rift-muted/55 mt-1 text-center">
          The rest of the league's offseason{fr.aging ? ", player aging, demotions & rookies/returnees," : ""} resolve as the next season begins.
        </p>
      </div>
    </div>
  );
}
