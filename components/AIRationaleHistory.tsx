"use client";

import { useMemo, useState } from "react";
import type { AIRationale } from "@/lib/draftAI";
import type { Champion, Lane } from "@/lib/types";
import LaneIcon from "./LaneIcon";

interface Props {
  history: Array<{ actionIndex: number; rationale: AIRationale }>;
  champions: Champion[];
}

// Post-draft replay of every AI decision in the just-finished game. Shown
// in BetweenGamesView when at least one AI action was recorded. Collapsed
// by default — hover/click to expand a row and see the full breakdown.
export default function AIRationaleHistory({ history, champions }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const byId = useMemo(() => {
    const m = new Map<number, Champion>();
    for (const c of champions) m.set(c.id, c);
    return m;
  }, [champions]);

  if (history.length === 0) return null;

  return (
    <div className="border border-rift-gold/30 bg-rift-panel/40 backdrop-blur-sm">
      <div className="px-3 md:px-4 py-2 border-b border-rift-gold/20">
        <div className="text-[10px] md:text-xs uppercase tracking-[0.4em] text-rift-gold/80">
          AI Decisions ({history.length})
        </div>
        <div className="text-[10px] text-rift-muted mt-0.5">
          Click any row to expand the full scoring breakdown.
        </div>
      </div>
      <div className="divide-y divide-rift-gold/10 max-h-[40vh] overflow-y-auto">
        {history.map((entry, i) => (
          <HistoryRow
            key={`${entry.actionIndex}-${i}`}
            entry={entry}
            byId={byId}
            expanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({
  entry,
  byId,
  expanded,
  onToggle,
}: {
  entry: { actionIndex: number; rationale: AIRationale };
  byId: Map<number, Champion>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { rationale } = entry;
  const champ = byId.get(rationale.championId);
  const isBan = rationale.kind === "ban";
  const sideClass =
    rationale.kind === "ban"
      ? "text-rift-redbright"
      : rationale.intendedLane
      ? "text-rift-bluebright"
      : "text-rift-goldbright";

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 md:px-4 py-1.5 flex items-center gap-2 md:gap-3 hover:bg-rift-gold/5 transition-colors text-left"
        aria-expanded={expanded}
      >
        {/* Action index */}
        <span className="text-[10px] tabular-nums text-rift-muted w-6 shrink-0">
          {entry.actionIndex + 1}
        </span>

        {/* Champion icon */}
        {champ ? (
          <img
            src={champ.iconUrl}
            alt={champ.name}
            className="w-6 h-6 md:w-7 md:h-7 rounded-sm object-cover shrink-0"
          />
        ) : (
          <div className="w-6 h-6 md:w-7 md:h-7 bg-rift-line/30 shrink-0" />
        )}

        {/* Kind + lane */}
        <span
          className={`text-[10px] uppercase tracking-[0.25em] w-12 md:w-16 shrink-0 ${sideClass}`}
        >
          {isBan ? "BAN" : rationale.intendedLane ?? "PICK"}
        </span>

        {/* Champion name */}
        <span className="text-rift-goldbright font-semibold flex-1 min-w-0 truncate">
          {champ?.name ?? "?"}
        </span>

        {/* Identity target (picks only) */}
        {rationale.identityLabel && (
          <span className="hidden md:inline text-[10px] text-rift-gold/70 truncate max-w-[140px]">
            {rationale.identityLabel}
          </span>
        )}

        {/* Score */}
        <span className="text-[10px] tabular-nums text-rift-muted w-12 text-right shrink-0">
          {rationale.total.toFixed(1)}
        </span>

        {/* Chevron */}
        <span className="text-rift-muted text-[10px] w-3 shrink-0">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="px-3 md:px-4 pb-3 pt-1 bg-rift-bgdeep/40 space-y-1">
          {rationale.components.map((c, ci) => (
            <ComponentLine
              key={ci}
              label={c.label}
              value={c.value}
              intendedLane={rationale.intendedLane}
            />
          ))}
          {rationale.alternatives.length > 0 && (
            <div className="mt-2 pt-2 border-t border-rift-gold/10">
              <div className="text-[9px] uppercase tracking-[0.3em] text-rift-muted mb-1">
                Also considered
              </div>
              <div className="flex flex-col gap-1">
                {rationale.alternatives.map((alt) => {
                  const altChamp = byId.get(alt.championId);
                  if (!altChamp) return null;
                  const delta = alt.score - rationale.total;
                  return (
                    <div
                      key={alt.championId}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <img
                        src={altChamp.iconUrl}
                        alt={altChamp.name}
                        className="w-4 h-4 rounded-sm object-cover"
                      />
                      <span className="text-rift-goldbright/90 flex-1 truncate">
                        {altChamp.name}
                      </span>
                      <span className="text-rift-muted tabular-nums">
                        {alt.score.toFixed(1)}
                      </span>
                      <span
                        className={`tabular-nums w-12 text-right ${
                          delta >= 0
                            ? "text-rift-bluebright/80"
                            : "text-rift-redbright/80"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {delta.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComponentLine({
  label,
  value,
  intendedLane,
}: {
  label: string;
  value: number;
  intendedLane: Lane | null;
}) {
  const positive = value >= 0;
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span
        className={`tabular-nums w-12 shrink-0 text-right ${
          positive ? "text-rift-bluebright" : "text-rift-redbright"
        }`}
      >
        {positive ? "+" : ""}
        {value.toFixed(1)}
      </span>
      <span className="text-rift-goldbright/90 flex-1 truncate">{label}</span>
      <span className="hidden md:inline text-[10px] text-rift-muted/80 max-w-[280px] truncate">
        {explainComponent(label, intendedLane)}
      </span>
    </div>
  );
}

// Same explanation map as the live overlay, kept locally for now. Could be
// hoisted into a shared module if a third surface needs it.
function explainComponent(label: string, intendedLane: Lane | null): string {
  const l = label;
  if (l.startsWith("Lane fit "))
    return `Champion's meta tier in ${intendedLane ?? "lane"}, weighted ×3.`;
  if (l === "Fills tank gap")
    return "Team had no tank — frontline gap is highest priority.";
  if (l === "Fills engage gap")
    return "Without engage the team has no opener.";
  if (l === "Fills hyper-carry gap")
    return "Team needed a late-game scaling carry.";
  if (l === "Adds peel") return "Team had fewer than 2 peelers.";
  if (l === "Damage gap fill") return "Filled an absent damage type.";
  if (l === "Damage stack penalty")
    return "Team was already top-heavy in this damage type.";
  if (l.startsWith("Completes "))
    return "Pick contributes to the team's emerging identity.";
  if (l === "Explicit synergy")
    return "Curated pair bonus from CHAMPION_SYNERGIES.";
  if (l === "Archetype synergy")
    return "Implicit pair bonus (engage+AOE, carry+peel, etc.).";
  if (l.startsWith("Counter "))
    return "Hard counter to a champion the opponent has drafted.";
  if (l.startsWith("Bad vs "))
    return "Champion is at a meaningful disadvantage in lane.";
  if (l === "Engage vs enemy poke")
    return "Engage tools close the gap on poke comps.";
  if (l === "Peel vs enemy dive") return "Peel cancels enemy dive composition.";
  if (l === "DPS vs tank wall") return "Hyper-carry damage shreds tank walls.";
  if (l === "Dive vs unprotected carry")
    return "Enemy carry has no peel — dive wins.";
  if (l === "Flex pick (early)")
    return "Multi-lane flex preserves draft optionality.";
  if (l === "Enemy banned archetype")
    return "Enemy banned multiple of this archetype — they feared it.";
  if (l === "Save for later games")
    return "Premium S+ pick held back for future fearless games.";
  if (l === "Jitter") return "Small random factor for variety.";
  if (l.startsWith("Meta tier")) return "Champion's strongest tier across lanes.";
  if (l === "Flex denial")
    return "Banning a multi-lane champ denies more options.";
  if (l.startsWith("Threat:")) return "Direct threat to our drafted comp.";
  if (l === "Denies enemy synergy")
    return "Banning breaks a synergy with what the enemy has locked.";
  if (l === "Anticipates enemy pick")
    return "Predicted top-3 of the enemy's next pick — denied.";
  return "";
}
