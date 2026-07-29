"use client";

import { useMemo, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { computePlayerSeasonLines } from "@/lib/season/stats";
import { PLAYER_TIER_VALUE } from "@/lib/players";
import type { Player, PlayerTier } from "@/lib/types";
import type { LeagueId } from "@/lib/season/types";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import LaneIcon from "./LaneIcon";
import TeamLogoLink from "./team/TeamLogoLink";
import RegionTeamFilters, {
  matchesTeamFilters,
  type FilterTeam,
} from "./season/RegionTeamFilters";
import PlayerNameLink from "./player/PlayerNameLink";
import TierChip from "./season/TierChip";

// In-dashboard reality banner: shows which reality/year you're in and, once the
// year is finished (Worlds done), the button to roll into the next season.
// Creating, switching and deleting realities lives in the Realities hub.

function ratingTone(avg: number | null) {
  if (avg == null) return "text-rift-muted/45";
  if (avg >= 7) return "text-emerald-400";
  if (avg < 5.5) return "text-rift-redbright/85";
  return "text-rift-gold/80";
}

const ROOKIE_GRID =
  "grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-2 gap-y-1";

export default function FranchisePanel() {
  const season = useDraftStore((s) => s.season);
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  /** Rookie class disclosure — expanded by default. */
  const [rookiesOpen, setRookiesOpen] = useState(true);
  const [rookieView, setRookieView] = useState<"yours" | "league">("yours");

  const filterTeams: FilterTeam[] = useMemo(() => {
    if (!season) return [];
    return season.teams.map((t) => ({
      id: t.id,
      name: t.name,
      leagueId: t.leagueId,
      iconKey: t.iconKey,
      logoUrl: t.logoUrl,
      color: t.color,
    }));
  }, [season]);

  const teamsById = useMemo(
    () => new Map(filterTeams.map((t) => [t.id, t])),
    [filterTeams],
  );

  // This year's rookie class — academy-first intake: players stamped with the
  // current franchise year in the academy pool (label Academy) plus any main-
  // roster debuts (safety call-ups / same-year promotions). Growth vs debut
  // tier and season rating once they've played.
  const rookies = useMemo(() => {
    const fr = season?.franchise;
    if (!season || !fr) return [];
    const lines = new Map(computePlayerSeasonLines(season).map((l) => [l.playerId, l]));
    const debutTier = new Map<string, PlayerTier>();
    const debutTeam = new Map<string, string>();
    const retiredName = new Map<string, string>();
    const retiredAge = new Map<string, number>();
    for (const n of season.rosterNews ?? []) {
      if (!n.entrantName) continue;
      debutTier.set(n.entrantName, n.entrantTier);
      debutTeam.set(n.entrantName, n.teamId);
      if (n.departedName) retiredName.set(n.entrantName, n.departedName);
      if (n.departedAge != null) retiredAge.set(n.entrantName, n.departedAge);
    }
    const teamById = new Map(season.teams.map((t) => [t.id, t]));
    const out: Array<{
      id: string;
      player: Player;
      name: string;
      lane: import("@/lib/types").Lane;
      teamId: string;
      team: { name: string; iconKey: string; logoUrl?: string; color: string };
      debut: PlayerTier | null;
      tier: PlayerTier;
      avg: number | null;
      games: number;
      transferred: boolean;
      replaced: string | null;
      replacedAge: number | null;
      academy: boolean;
    }> = [];
    const seen = new Set<string>();
    // Academy rookies (primary intake under academy-first).
    for (const e of fr.inactivePool ?? []) {
      if (e.status !== "academy") continue;
      const p = e.player;
      if (p.debutYear !== fr.year || !p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      const team = teamById.get(e.lastTeamId);
      const line = lines.get(p.id);
      const debut = (p.name && debutTier.get(p.name)) || null;
      out.push({
        id: p.id,
        player: p,
        name: p.name ?? "—",
        lane: p.lane,
        teamId: e.lastTeamId,
        team: team
          ? { name: team.name, iconKey: team.iconKey, logoUrl: team.logoUrl, color: team.color }
          : {
              name: e.lastTeamName ?? "Academy",
              iconKey: "shield",
              color: "#666",
            },
        debut,
        tier: p.tier,
        avg: line?.avgRating ?? null,
        games: line?.games ?? 0,
        transferred: false,
        replaced: p.name ? retiredName.get(p.name) ?? null : null,
        replacedAge: p.name ? retiredAge.get(p.name) ?? null : null,
        academy: true,
      });
    }
    // Main-roster debuts (same-year call-ups / rare safety rookies).
    for (const t of season.teams) {
      for (const p of t.players) {
        if (p.debutYear !== fr.year || !p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        const line = lines.get(p.id);
        const debut = (p.name && debutTier.get(p.name)) || null;
        out.push({
          id: p.id,
          player: p,
          name: p.name ?? "—",
          lane: p.lane,
          teamId: t.id,
          team: { name: t.name, iconKey: t.iconKey, logoUrl: t.logoUrl, color: t.color },
          debut,
          tier: p.tier,
          avg: line?.avgRating ?? null,
          games: line?.games ?? 0,
          transferred: !!(p.name && debutTeam.get(p.name) && debutTeam.get(p.name) !== t.id),
          replaced: p.name ? retiredName.get(p.name) ?? null : null,
          replacedAge: p.name ? retiredAge.get(p.name) ?? null : null,
          academy: false,
        });
      }
    }
    // Best risers first: tier growth, then current tier, then rating.
    return out.sort(
      (a, b) =>
        Number(b.academy) - Number(a.academy) ||
        growth(b) - growth(a) ||
        PLAYER_TIER_VALUE[b.tier] - PLAYER_TIER_VALUE[a.tier] ||
        (b.avg ?? 0) - (a.avg ?? 0),
    );
  }, [season]);

  const filteredRookies = useMemo(
    () =>
      rookies.filter((r) =>
        matchesTeamFilters(r.teamId, teamsById, leagueFilter, teamFilter),
      ),
    [rookies, teamsById, leagueFilter, teamFilter],
  );

  const controlledId = season?.config.controlledTeamId;
  const yourRookies = useMemo(
    () =>
      filteredRookies.filter((r) => !controlledId || r.teamId === controlledId),
    [filteredRookies, controlledId],
  );
  const leagueRookies = useMemo(
    () =>
      filteredRookies.filter((r) => !controlledId || r.teamId !== controlledId),
    [filteredRookies, controlledId],
  );
  const visibleRookies = rookieView === "yours" ? yourRookies : leagueRookies;
  const rookieStats = useMemo(() => {
    const academy = filteredRookies.filter((r) => r.academy).length;
    const main = filteredRookies.length - academy;
    const yours = yourRookies.length;
    return { academy, main, yours, total: filteredRookies.length };
  }, [filteredRookies, yourRookies.length]);

  const fr = season?.franchise ?? null;
  if (!fr) return null;
  // When the year is complete the Offseason view takes over (stats + the big
  // transfer window + the Finalize button), so this is just the live banner.
  if (season?.status === "complete") return null;

  return (
    <div className="mb-8 border border-rift-blue/40 bg-rift-blue/[0.04]">
      <div className="px-3 py-1.5 border-b border-rift-blue/30 flex items-center gap-2">
        <span className="font-display text-sm tracking-wider text-rift-bluebright">
          {fr.name}
        </span>
        <span className="text-[10px] uppercase tracking-[0.3em] text-rift-muted/60">
          Reality · Year {fr.year}
        </span>
        <span className="ml-auto text-[8px] uppercase tracking-[0.25em] text-rift-muted/45">
          aging {fr.aging ? "on" : "off"}
        </span>
      </div>
      <div className="px-3 py-2">
        <div className="text-[10px] italic text-rift-muted/70">
          Play out the year — Winter → First Stand → Spring → MSI → Summer →
          Worlds — then the offseason opens.
        </div>
      </div>

      {rookies.length > 0 && (
        <div className="px-3 pb-2.5">
          <button
            type="button"
            onClick={() => setRookiesOpen((v) => !v)}
            aria-expanded={rookiesOpen}
            className="w-full flex items-center justify-between gap-2 mb-1.5 text-left"
          >
            <span className="text-[8px] uppercase tracking-[0.3em] text-emerald-300/80">
              Rookie Class · Year {fr.year}
              <span className="ml-1.5 normal-case tracking-normal text-rift-muted/45 tabular-nums">
                {rookieStats.total}
                {(leagueFilter || teamFilter) && rookieStats.total !== rookies.length
                  ? ` of ${rookies.length}`
                  : ""}
              </span>
            </span>
            <span className="text-emerald-300/60 text-[10px] leading-none" aria-hidden>
              {rookiesOpen ? "▴" : "▾"}
            </span>
          </button>
          {rookiesOpen && (
          <>
          <div className="-mx-3 px-3 py-2 mb-2 border-y border-rift-line/20 bg-[#010a13]/90 space-y-2">
            <div className="flex flex-wrap gap-2 text-[8px] uppercase tracking-[0.14em]">
              <span className="px-1.5 py-px border border-emerald-500/35 text-emerald-300/85 tabular-nums">
                {rookieStats.main} main
              </span>
              <span className="px-1.5 py-px border border-amber-500/35 text-amber-300/85 tabular-nums">
                {rookieStats.academy} academy
              </span>
              {controlledId && (
                <span className="px-1.5 py-px border border-rift-blue/35 text-rift-bluebright/85 tabular-nums">
                  {rookieStats.yours} yours
                </span>
              )}
            </div>
            <RegionTeamFilters
              teams={filterTeams}
              leagueFilter={leagueFilter}
              teamFilter={teamFilter}
              onLeagueFilter={setLeagueFilter}
              onTeamFilter={setTeamFilter}
            />
            {controlledId && (
              <div className="inline-flex flex-wrap gap-0.5 p-0.5 border border-rift-line/40 bg-rift-bg/50">
                {(
                  [
                    { id: "yours" as const, label: "Your org", count: yourRookies.length },
                    { id: "league" as const, label: "Rest of league", count: leagueRookies.length },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRookieView(opt.id)}
                    className={`px-2.5 py-1 text-[8px] uppercase tracking-[0.18em] transition-all ${
                      rookieView === opt.id
                        ? "bg-emerald-500/12 border border-emerald-500/45 text-emerald-300/95"
                        : "border border-transparent text-rift-mutedbright hover:text-emerald-300/80"
                    }`}
                  >
                    {opt.label}
                    <span className="ml-1 tabular-nums text-rift-muted/45">{opt.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border border-emerald-500/20 bg-emerald-500/[0.03] overflow-x-auto">
            {visibleRookies.length === 0 ? (
              <div className="px-2.5 py-4 text-center">
                <div className="font-display text-[11px] text-rift-mutedbright/75">
                  {rookieView === "yours" ? "No rookies in your org" : "No other rookies match"}
                </div>
                <div className="mt-1 text-[10px] italic text-rift-muted/55">
                  {rookieView === "yours"
                    ? "Academy intake and main-roster debuts for your team show here first."
                    : "Try clearing region or team filters to browse the full class."}
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`${ROOKIE_GRID} px-2.5 py-1 border-b border-rift-line/20 text-[7px] uppercase tracking-[0.18em] text-rift-muted/50`}
                >
                  <span title="Team">Org</span>
                  <span title="Role">Role</span>
                  <span>Player</span>
                  <span>Status</span>
                  <span className="text-center">Tier</span>
                  <span className="text-right">Avg</span>
                  <span className="text-right">GP</span>
                </div>
                <div className="divide-y divide-rift-line/12">
                  {visibleRookies.map((r) => {
                    const g = growth(r);
                    const highlight = r.teamId === controlledId;
                    return (
                      <div
                        key={r.id}
                        className={`${ROOKIE_GRID} px-2.5 py-1.5 text-[10px] ${
                          highlight ? "bg-rift-blue/[0.06]" : "hover:bg-rift-bg/20"
                        }`}
                      >
                        <TeamLogoLink
                          teamId={r.teamId}
                          name={r.team.name}
                          iconKey={r.team.iconKey}
                          logoUrl={resolveTeamLogo(r.team.name, r.team.logoUrl)}
                          color={r.team.color}
                          size={14}
                          hint={{
                            team: season?.teams.find((t) => t.id === r.teamId),
                            name: r.team.name,
                          }}
                          renderAs="span"
                        />
                        <LaneIcon lane={r.lane} size="xs" />
                        <span className="min-w-0 flex flex-col leading-tight gap-0.5">
                          <PlayerNameLink
                            playerId={r.id}
                            name={r.name}
                            hint={{ player: r.player, teamName: r.team.name }}
                            title={r.name}
                            className="truncate text-rift-mutedbright font-medium"
                          />
                          {r.replaced && (
                            <span
                              className="truncate text-[8px] text-rift-redbright/70"
                              title={`${r.replaced} demoted${r.replacedAge != null ? ` at ${r.replacedAge}` : ""}`}
                            >
                              ↩ {r.replaced}
                              {r.replacedAge != null ? ` (${r.replacedAge})` : ""}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {r.academy ? (
                            <span
                              className="px-1 py-px border border-amber-500/45 bg-amber-500/10 text-[7px] uppercase tracking-[0.12em] text-amber-300/90"
                              title="Academy prospect (not yet on main roster)"
                            >
                              Academy
                            </span>
                          ) : (
                            <span className="px-1 py-px border border-emerald-500/35 text-[7px] uppercase tracking-[0.12em] text-emerald-400/80">
                              Main
                            </span>
                          )}
                          {r.transferred && (
                            <span
                              className="px-1 py-px border border-rift-gold/30 text-[7px] uppercase tracking-[0.12em] text-rift-gold/70"
                              title="Transferred since debut"
                            >
                              Moved
                            </span>
                          )}
                        </span>
                        <span className="inline-flex items-center justify-center gap-0.5">
                          {r.debut && r.debut !== r.tier && (
                            <>
                              <TierChip tier={r.debut} size="xs" />
                              <span className={g > 0 ? "text-emerald-400" : "text-rift-redbright"}>
                                {g > 0 ? "↗" : "↘"}
                              </span>
                            </>
                          )}
                          <TierChip tier={r.tier} size="xs" />
                        </span>
                        <span className="text-right tabular-nums shrink-0">
                          <span className={`font-display ${ratingTone(r.avg)}`}>
                            {r.avg != null ? r.avg.toFixed(1) : "—"}
                          </span>
                          {r.avg != null && (
                            <span
                              className="block h-0.5 mt-0.5 bg-rift-line/30 overflow-hidden rounded-full"
                              aria-hidden
                            >
                              <span
                                className={`block h-full ${r.avg >= 7 ? "bg-emerald-500/70" : r.avg < 5.5 ? "bg-rift-red/60" : "bg-rift-gold/60"}`}
                                style={{ width: `${Math.min(100, (r.avg / 10) * 100)}%` }}
                              />
                            </span>
                          )}
                        </span>
                        <span
                          className="text-right tabular-nums text-rift-muted/55 shrink-0"
                          title="Games played"
                        >
                          {r.games}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          </>
          )}
        </div>
      )}
    </div>
  );
}

// Tier growth since debut (current − debut), 0 when debut tier unknown.
function growth(r: { debut: PlayerTier | null; tier: PlayerTier }): number {
  return r.debut ? PLAYER_TIER_VALUE[r.tier] - PLAYER_TIER_VALUE[r.debut] : 0;
}
