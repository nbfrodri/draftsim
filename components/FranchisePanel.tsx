"use client";

import { useMemo, useState } from "react";
import { useDraftStore } from "@/store/draftStore";
import { computePlayerSeasonLines } from "@/lib/season/stats";
import { PLAYER_TIER_VALUE } from "@/lib/players";
import type { PlayerTier } from "@/lib/types";
import type { LeagueId } from "@/lib/season/types";
import LaneIcon from "./LaneIcon";
import TeamIcon from "./TeamIcon";
import RegionTeamFilters, {
  matchesTeamFilters,
  type FilterTeam,
} from "./season/RegionTeamFilters";

// In-dashboard reality banner: shows which reality/year you're in and, once the
// year is finished (Worlds done), the button to roll into the next season.
// Creating, switching and deleting realities lives in the Realities hub.

const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/20",
  S: "border-rift-gold/60 text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/50 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line/50 text-rift-mutedbright",
  C: "border-rift-line/40 text-rift-muted",
  D: "border-rift-red/40 text-rift-redbright/80",
};

export default function FranchisePanel() {
  const season = useDraftStore((s) => s.season);
  const [leagueFilter, setLeagueFilter] = useState<LeagueId | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

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
          <div className="text-[8px] uppercase tracking-[0.3em] text-emerald-300/80 mb-1">
            Rookie Class · Year {fr.year}
          </div>
          <RegionTeamFilters
            teams={filterTeams}
            leagueFilter={leagueFilter}
            teamFilter={teamFilter}
            onLeagueFilter={setLeagueFilter}
            onTeamFilter={setTeamFilter}
          />
          <div className="border border-emerald-500/20 bg-emerald-500/[0.03] divide-y divide-rift-line/15">
            {filteredRookies.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[10px] italic text-rift-muted/55">
                No rookies match these filters.
              </div>
            ) : (
              filteredRookies.map((r) => {
                const g = growth(r);
                return (
                  <div key={r.id} className="flex items-center gap-2 px-2.5 py-1 text-[10px]">
                    <TeamIcon iconKey={r.team.iconKey} logoUrl={r.team.logoUrl} size={13} color={r.team.color} />
                    <LaneIcon lane={r.lane} size="xs" />
                    <span className="min-w-0 flex-1 flex flex-col leading-tight">
                      <span className="truncate text-rift-mutedbright font-medium">{r.name}</span>
                      {r.replaced && (
                        <span className="truncate text-[8px] text-rift-redbright/70" title={`${r.replaced} demoted${r.replacedAge != null ? ` at ${r.replacedAge}` : ""}`}>
                          ↩ replaced {r.replaced}
                          {r.replacedAge != null ? ` (${r.replacedAge})` : ""}
                        </span>
                      )}
                    </span>
                    {r.academy && (
                      <span
                        className="text-[7px] uppercase tracking-[0.15em] text-amber-300/90 border border-amber-500/45 bg-amber-500/10 px-1 flex-shrink-0"
                        title="Academy prospect (not yet on main roster)"
                      >
                        Academy
                      </span>
                    )}
                    {r.transferred && (
                      <span className="text-[7px] uppercase tracking-[0.15em] text-rift-gold/70 border border-rift-gold/30 px-1 flex-shrink-0" title="Transferred since debut">
                        ⇄
                      </span>
                    )}
                    {/* Growth: debut tier → current tier. */}
                    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                      {r.debut && r.debut !== r.tier && (
                        <>
                          <span className={`px-1 border font-display text-[8px] ${TIER_CLS[r.debut]}`}>{r.debut}</span>
                          <span className={g > 0 ? "text-emerald-400" : "text-rift-redbright"}>{g > 0 ? "↗" : "↘"}</span>
                        </>
                      )}
                      <span className={`px-1 border font-display text-[8px] ${TIER_CLS[r.tier]}`}>{r.tier}</span>
                    </span>
                    <span className="w-12 text-right tabular-nums text-rift-gold/80 flex-shrink-0" title="Average rating this season">
                      {r.avg != null ? r.avg.toFixed(1) : "—"}
                    </span>
                    <span className="w-8 text-right tabular-nums text-rift-muted/50 flex-shrink-0" title="Games played">
                      {r.games}g
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Tier growth since debut (current − debut), 0 when debut tier unknown.
function growth(r: { debut: PlayerTier | null; tier: PlayerTier }): number {
  return r.debut ? PLAYER_TIER_VALUE[r.tier] - PLAYER_TIER_VALUE[r.debut] : 0;
}
