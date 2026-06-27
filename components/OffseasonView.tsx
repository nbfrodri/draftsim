"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import { MAIN_POOL } from "@/lib/players";
import {
  offseasonCandidates,
  userTransferCount,
  USER_MAX_TRANSFERS_PER_WINDOW,
} from "@/lib/season/transfers";
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
} from "@/lib/season/types";
import type { Champion, Lane, PlayerTier } from "@/lib/types";
import TeamIcon from "./TeamIcon";
import LaneIcon from "./LaneIcon";
import { LeagueConfigCard, IntlConfigCard, INTL_IDS } from "./season/configCards";

// The post-Worlds OFFSEASON for a reality: the year is decided, and before
// rolling into the next one the user sees the season's headline stats and runs
// their team's biggest transfer window — then finalizes (aging + the rest of
// the league's offseason auto-resolves on the way to next year).

const LANE_ORDER: Lane[] = ["top", "jungle", "middle", "bottom", "support"];
const TIER_CLS: Record<PlayerTier, string> = {
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
  const shopOffseasonCoach = useDraftStore((s) => s.shopOffseasonCoach);
  const updateSeasonConfig = useDraftStore((s) => s.updateSeasonConfig);
  const continueSeasonToNextYear = useDraftStore((s) => s.continueSeasonToNextYear);
  const [shopLane, setShopLane] = useState<Lane | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [fmtOpen, setFmtOpen] = useState(false);

  // This component is mounted throughout the live season but renders nothing
  // until the offseason. `computeSeasonStats` is O(every game in the season),
  // so gate it on `active` — otherwise it recomputes the whole season on every
  // sim tick while showing nothing, which visibly slows simulations.
  const active = !!season?.franchise && season.status === "complete";
  const byId = useMemo(() => new Map(champions.map((c) => [c.id, c] as const)), [champions]);
  const stats = useMemo(() => (active && season ? computeSeasonStats(season) : null), [active, season]);
  const candidates = useMemo(
    () => (active && season && shopLane ? offseasonCandidates(season, champions, shopLane) : []),
    [active, season, champions, shopLane],
  );

  if (!active || !season) return null;

  const fr = season.franchise!; // guaranteed by `active`
  const controlled = seasonTeam(season, season.config.controlledTeamId);
  const championTeam = seasonTeam(season, season.champion);
  const movedLanes = new Set<Lane>();
  if (controlled) {
    for (const m of season.transfersByEvent?.worlds ?? []) {
      if (m.fromTeamId === controlled.id || m.toTeamId === controlled.id) movedLanes.add(m.lane);
    }
  }
  // Per-window transfer cap ("worlds" is the offseason window key).
  const usedCount = controlled ? userTransferCount(season, "worlds", controlled.id) : 0;
  const capReached = usedCount >= USER_MAX_TRANSFERS_PER_WINDOW;
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
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-rift-bluebright">
            <TeamIcon iconKey={championTeam.iconKey} logoUrl={championTeam.logoUrl} size={16} color={championTeam.color} />
            {championTeam.name} — World Champion
          </span>
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
                <div className="text-[10px] text-rift-mutedbright truncate">
                  {rows[0].playerName || rows[0].teamName}{" "}
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
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">
              Shop your roster — biggest window of the year
            </span>
            <span
              className={`ml-auto text-[8px] uppercase tracking-[0.2em] tabular-nums ${capReached ? "text-rift-redbright/80" : "text-rift-muted/60"}`}
              title={`Up to ${USER_MAX_TRANSFERS_PER_WINDOW} transfers, one per role`}
            >
              {usedCount}/{USER_MAX_TRANSFERS_PER_WINDOW} signed
            </span>
          </div>
          <div className="space-y-1">
            {LANE_ORDER.map((lane, li) => {
              const p = controlled.players[li];
              if (!p) return null;
              const open = shopLane === lane;
              const moved = movedLanes.has(lane);
              const willing = candidates.filter((c) => c.willing);
              return (
                <div key={lane}>
                  <div className="flex items-center gap-2 text-[10px]">
                    <LaneIcon lane={lane} size="sm" className="shrink-0" />
                    <span className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}>{p.tier}</span>
                    {p.name && (
                      <span className="text-rift-mutedbright font-medium max-w-[110px] truncate" title={p.name}>
                        {p.name}
                      </span>
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
                    {moved ? (
                      <span className="ml-auto text-[8px] uppercase tracking-[0.2em] text-emerald-400/80">✓ signed</span>
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
                  </div>
                  {open && !moved && (
                    <div className="ml-8 mt-1 space-y-1">
                      {willing.length === 0 ? (
                        <div className="text-[9px] italic text-rift-muted">No team will trade for this slot.</div>
                      ) : (
                        willing.slice(0, 6).map((c) => {
                          const other = seasonTeam(season, c.otherTeamId);
                          return (
                            <div key={c.otherTeamId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                              <span className="inline-flex items-center gap-1 text-rift-mutedbright">
                                <TeamIcon iconKey={other?.iconKey ?? "shield"} logoUrl={other?.logoUrl} size={12} color={other?.color} />
                                <span className="truncate max-w-[96px]">{other?.name ?? "—"}</span>
                              </span>
                              <span className={`w-5 text-center border font-display ${TIER_CLS[c.theirs.tier]}`}>{c.theirs.tier}</span>
                              {c.theirs.name && <span className="truncate max-w-[88px] text-rift-mutedbright">{c.theirs.name}</span>}
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

      {/* Coach market — coaches only change between years. Swap yours for a
          rival's: the other team takes your old coach in return. */}
      {controlled && (
        <div className="px-3 py-2 border-t border-rift-gold/15">
          <div className="flex items-center gap-2 text-[10px] mb-1">
            <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">Coach</span>
            {controlled.coach ? (
              <span className="text-rift-mutedbright font-medium">
                {controlled.coach.name}
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
                      <span className="inline-flex items-center gap-1 text-rift-mutedbright">
                        <TeamIcon iconKey={t.iconKey} logoUrl={t.logoUrl} size={12} color={t.color} />
                        <span className="truncate max-w-[88px]">{t.name}</span>
                      </span>
                      <span className="text-rift-mutedbright truncate max-w-[88px]">{t.coach!.name}</span>
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

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => continueSeasonToNextYear()}
          className="w-full py-2 border-2 border-rift-gold bg-rift-gold/10 text-rift-goldbright text-[11px] uppercase tracking-[0.3em] hover:bg-rift-gold/20 transition-all"
        >
          Finalize Offseason → Year {fr.year + 1}
        </button>
        <p className="text-[8px] text-rift-muted/55 mt-1 text-center">
          The rest of the league's offseason{fr.aging ? ", player aging, retirements & rookies," : ""} resolve as the next season begins.
        </p>
      </div>
    </div>
  );
}
