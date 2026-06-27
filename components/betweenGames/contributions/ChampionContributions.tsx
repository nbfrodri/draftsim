"use client";

import { memo, useMemo } from "react";
import { getChampionMeta } from "@/lib/championMeta";
import { syntheticDamage } from "@/lib/sim/descriptions";
import type { Champion, Lane, Side } from "@/lib/types";
import type { SideLaneKDA } from "../shared";
import { LANE_ORDER } from "../shared";
import { ContributionRow } from "./ContributionRow";

// Champion contributions panel. After a match finishes (laneKDA provided),
// each row displays a synthetic damage-share bar derived from KDA +
// archetype damage profile. During pre-sim or live playback (laneKDA
// undefined), it shows just the meta tags — same panel, two states.
// Memoized: during live playback laneKDA/ratings stay undefined and all
// other props are referentially stable, so the panel doesn't re-render per
// playback update — only once when the match finishes.
export const ChampionContributions = memo(function ChampionContributions({
  side,
  picks,
  lanes,
  byId,
  laneKDA,
  ratings,
  forms,
  playerNames,
}: {
  side: Side;
  picks: (number | null)[];
  lanes: (Lane | null)[];
  byId: Map<number, Champion>;
  laneKDA?: SideLaneKDA;
  // Per-lane ordered ratings (top/jg/mid/bot/sup), 1-10. Optional.
  ratings?: number[];
  // Per-lane ordered form values [-1,1]. Optional.
  forms?: number[];
  // Per-lane player handles in positional order. Optional.
  playerNames?: (string | null)[];
}) {
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const accentBg = side === "blue" ? "bg-rift-blue/5" : "bg-rift-red/5";
  const sideLabel = side === "blue" ? "Blue" : "Red";
  const sideAccent =
    side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";

  // Compute team total damage so each row knows its share %.
  const totalDamage = useMemo(() => {
    if (!laneKDA) return 0;
    let total = 0;
    for (let i = 0; i < picks.length; i++) {
      const id = picks[i];
      if (id == null) continue;
      const c = byId.get(id);
      if (!c) continue;
      const lane = LANE_ORDER[i];
      const kda = laneKDA[lane];
      const meta = getChampionMeta(c.alias);
      if (!meta) continue;
      total += syntheticDamage(kda, meta);
    }
    return total;
  }, [laneKDA, picks, byId]);

  return (
    <div className={`border-2 ${border} ${accentBg} p-3 md:p-4`}>
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-rift-line/40">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] md:text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
            Roster
          </span>
          <span
            className={`font-display text-[11px] md:text-xs tracking-[0.2em] uppercase ${sideAccent}`}
          >
            {sideLabel}
          </span>
        </div>
        {laneKDA != null && (
          <span className="text-[8px] md:text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/70">
            damage share
          </span>
        )}
      </div>
      <div className="space-y-2 md:space-y-2.5">
        {picks.map((id, i) => {
          const c = id != null ? byId.get(id) ?? null : null;
          if (!c) return null;
          const meta = getChampionMeta(c.alias);
          const lane = LANE_ORDER[i];
          const kda = laneKDA?.[lane];
          // Damage share per champion (only shown post-match).
          let damageShare = 0;
          if (laneKDA && meta && kda && totalDamage > 0) {
            damageShare = syntheticDamage(kda, meta) / totalDamage;
          }
          return (
            <ContributionRow
              key={`${c.id}-${i}`}
              champ={c}
              meta={meta}
              lane={lanes[i] ?? lane}
              side={side}
              kda={kda ?? null}
              damageShare={laneKDA ? damageShare : null}
              rating={ratings?.[i]}
              form={forms?.[i]}
              playerName={playerNames?.[i]}
            />
          );
        })}
      </div>
    </div>
  );
});
