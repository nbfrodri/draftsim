"use client";

import { useMemo } from "react";
import { useDraftStore } from "@/store/draftStore";
import { computePlayerSeasonLines } from "@/lib/season/stats";
import { PLAYER_TIER_VALUE } from "@/lib/players";
import type { PlayerTier } from "@/lib/types";
import LaneIcon from "./LaneIcon";
import TeamIcon from "./TeamIcon";

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

  // This year's rookie class — players stamped with the current franchise year,
  // their current team (reflects any mid-year transfer), growth vs. debut tier,
  // and this season's average rating once they've played.
  const rookies = useMemo(() => {
    const fr = season?.franchise;
    if (!season || !fr) return [];
    const lines = new Map(computePlayerSeasonLines(season).map((l) => [l.playerId, l]));
    const debutTier = new Map<string, PlayerTier>();
    const debutTeam = new Map<string, string>();
    const retiredName = new Map<string, string>();
    const retiredAge = new Map<string, number>();
    for (const n of season.rosterNews ?? []) {
      debutTier.set(n.rookieName, n.rookieTier);
      debutTeam.set(n.rookieName, n.teamId);
      // The veteran this rookie replaced — surfaced regardless of the transfers
      // setting, so retirements are visible even when the transfer window isn't.
      if (n.retiredName) retiredName.set(n.rookieName, n.retiredName);
      if (n.retiredAge != null) retiredAge.set(n.rookieName, n.retiredAge);
    }
    const out: Array<{
      id: string;
      name: string;
      lane: import("@/lib/types").Lane;
      team: { name: string; iconKey: string; logoUrl?: string; color: string };
      debut: PlayerTier | null;
      tier: PlayerTier;
      avg: number | null;
      games: number;
      transferred: boolean;
      replaced: string | null;
      replacedAge: number | null;
    }> = [];
    for (const t of season.teams) {
      for (const p of t.players) {
        if (p.debutYear !== fr.year || !p.id) continue;
        const line = lines.get(p.id);
        const debut = (p.name && debutTier.get(p.name)) || null;
        out.push({
          id: p.id,
          name: p.name ?? "—",
          lane: p.lane,
          team: { name: t.name, iconKey: t.iconKey, logoUrl: t.logoUrl, color: t.color },
          debut,
          tier: p.tier,
          avg: line?.avgRating ?? null,
          games: line?.games ?? 0,
          transferred: !!(p.name && debutTeam.get(p.name) && debutTeam.get(p.name) !== t.id),
          replaced: p.name ? retiredName.get(p.name) ?? null : null,
          replacedAge: p.name ? retiredAge.get(p.name) ?? null : null,
        });
      }
    }
    // Best risers first: tier growth, then current tier, then rating.
    return out.sort(
      (a, b) =>
        growth(b) - growth(a) ||
        PLAYER_TIER_VALUE[b.tier] - PLAYER_TIER_VALUE[a.tier] ||
        (b.avg ?? 0) - (a.avg ?? 0),
    );
  }, [season]);

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
          <div className="border border-emerald-500/20 bg-emerald-500/[0.03] divide-y divide-rift-line/15">
            {rookies.map((r) => {
              const g = growth(r);
              return (
                <div key={r.id} className="flex items-center gap-2 px-2.5 py-1 text-[10px]">
                  <TeamIcon iconKey={r.team.iconKey} logoUrl={r.team.logoUrl} size={13} color={r.team.color} />
                  <LaneIcon lane={r.lane} size="xs" />
                  <span className="min-w-0 flex-1 flex flex-col leading-tight">
                    <span className="truncate text-rift-mutedbright font-medium">{r.name}</span>
                    {r.replaced && (
                      <span className="truncate text-[8px] text-rift-redbright/70" title={`${r.replaced} retired${r.replacedAge != null ? ` at ${r.replacedAge}` : ""}`}>
                        ↩ replaced {r.replaced}
                        {r.replacedAge != null ? ` (${r.replacedAge})` : ""}
                      </span>
                    )}
                  </span>
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
            })}
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
