"use client";

import { useMemo, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import {
  listFreeAgents,
  yearsLeftToRetire,
} from "@/lib/season/faMarket";
import { LANE_ORDER } from "@/lib/players";
import type { Lane } from "@/lib/types";
import InactiveBrowseRow from "./season/InactiveBrowseRow";

/**
 * Season-mode browse of every free agent in `franchise.inactivePool`.
 * Read-only — signing lives on transfer / offseason boards.
 */
export default function FreeAgentsPanel() {
  const season = useDraftStore((s) => s.season);
  const [open, setOpen] = useState(false);
  const [lane, setLane] = useState<Lane | "all">("all");

  const fas = useMemo(() => {
    const pool = season?.franchise?.inactivePool ?? [];
    if (!season?.franchise?.aging) return [];
    return listFreeAgents(pool);
  }, [season]);

  const filtered = useMemo(
    () => (lane === "all" ? fas : fas.filter((e) => e.player.lane === lane)),
    [fas, lane],
  );

  if (!season?.franchise?.aging) return null;

  return (
    <div className="mb-8 cv-auto">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 border border-rift-line/50 bg-rift-bg/40 text-[10px] uppercase tracking-[0.3em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
      >
        <span className="inline-flex items-center gap-2">
          Free Agents
          <span className="normal-case tracking-normal text-rift-muted/55 tabular-nums">
            {fas.length}
          </span>
        </span>
        <span>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="border border-t-0 border-rift-line/40 bg-rift-bg/20 p-3 space-y-2">
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", ...LANE_ORDER] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLane(l)}
                className={`px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
                  lane === l
                    ? "border-rift-gold/70 text-rift-goldbright bg-rift-gold/10"
                    : "border-rift-line/50 text-rift-muted/60 hover:text-rift-mutedbright"
                }`}
              >
                {l === "all" ? "All" : l.slice(0, 3)}
              </button>
            ))}
            <span className="ml-auto text-[8px] text-rift-muted/45 tabular-nums">
              {filtered.length} shown
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="text-[9px] italic text-rift-muted px-1">
              No free agents{lane !== "all" ? ` at ${lane}` : ""} in the pool.
            </div>
          ) : (
            <div className="space-y-0.5 max-h-72 overflow-y-auto divide-y divide-rift-line/10">
              {filtered.map((entry) => (
                <InactiveBrowseRow
                  key={entry.player.id ?? `${entry.lastTeamId}-${entry.player.name}`}
                  entry={entry}
                  showLastTeam
                  actions={
                    <span
                      className="text-[7px] uppercase tracking-[0.12em] text-rift-muted/40"
                      title={`${yearsLeftToRetire(entry)} years until retirement if unsigned`}
                    >
                      {yearsLeftToRetire(entry)}y left
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
