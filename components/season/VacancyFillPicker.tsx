"use client";

import { useState } from "react";

import {
  FA_OPEN_REPLACE_GAP,
  ACADEMY_OPEN_REPLACE_GAP,
  USER_MAX_FA_SIGNS,
  type FaBoardRow,
} from "@/lib/season/faMarket";
import type { Lane, PlayerTier } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";
import InactiveBoardTip from "./InactiveBoardTip";

const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

type FillTab = "academy" | "fa" | "rookie";

interface Props {
  lane: Lane;
  academyRows: FaBoardRow[];
  faRows: FaBoardRow[];
  signsUsed: number;
  onAcademy: (playerId: string) => void;
  onFa: (playerId: string) => void;
  onRookie: () => void;
  /** Dismiss picker; vacancy stays for AI fill on Proceed / Let AI decide. */
  onLeaveForAi: () => void;
  /** Jump to the full FA / academy board filtered to this lane. */
  onBrowseBoard?: (kind: "fa" | "academy") => void;
}

/**
 * Post-demote (or vacant-slot) replacement chooser: Academy / FA / Rookie,
 * with an explicit Leave for AI fallback.
 */
export default function VacancyFillPicker({
  lane,
  academyRows,
  faRows,
  signsUsed,
  onAcademy,
  onFa,
  onRookie,
  onLeaveForAi,
  onBrowseBoard,
}: Props) {
  const [tab, setTab] = useState<FillTab>("academy");
  const signsOk = signsUsed < USER_MAX_FA_SIGNS;
  const canAct = (row: FaBoardRow, kind: "academy" | "fa") =>
    signsOk &&
    (row.upgradeVsSlot ?? 0) >=
      (kind === "academy" ? ACADEMY_OPEN_REPLACE_GAP : FA_OPEN_REPLACE_GAP);

  const renderList = (
    rows: FaBoardRow[],
    kind: "academy" | "fa",
    empty: string,
    action: string,
  ) => {
    if (rows.length === 0) {
      return <div className="text-[9px] italic text-rift-muted px-1 py-1">{empty}</div>;
    }
    const needGap = kind === "academy" ? ACADEMY_OPEN_REPLACE_GAP : FA_OPEN_REPLACE_GAP;
    return (
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {rows.slice(0, 12).map((row) => {
          const p = row.entry.player;
          const ok = canAct(row, kind);
          return (
            <div
              key={`${kind}-vac-${p.id}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1.5 py-0.5 text-[10px]"
            >
              <InactiveBoardTip row={row}>
                <LaneIcon lane={p.lane} size="xs" className="shrink-0" />
                <span className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}>
                  {p.tier}
                </span>
                <span className="text-rift-mutedbright truncate max-w-[100px]">{p.name}</span>
                <span className="text-[8px] text-rift-muted/55 tabular-nums">
                  {row.value.toFixed(1)}
                </span>
              </InactiveBoardTip>
              <button
                type="button"
                disabled={!ok || !p.id}
                onClick={() => p.id && (kind === "fa" ? onFa(p.id) : onAcademy(p.id))}
                title={
                  ok
                    ? `${action} into vacant ${lane}`
                    : !signsOk
                      ? `Sign cap (${USER_MAX_FA_SIGNS}/window) reached`
                      : `Need +${needGap} value over slot`
                }
                className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {action}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="ml-8 mt-1 mb-1 border border-amber-500/25 bg-amber-500/[0.03] px-2 py-1.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[8px] uppercase tracking-[0.2em] text-amber-300/80">
          Fill {lane}
        </span>
        <span className="text-[8px] text-rift-muted/50 tabular-nums">
          {signsUsed}/{USER_MAX_FA_SIGNS} signed
        </span>
        <button
          type="button"
          onClick={onLeaveForAi}
          title="Keep vacancy open — AI fills on Proceed / Let AI decide"
          className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-amber-400/50 hover:text-amber-200 transition-all"
        >
          Leave for AI
        </button>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {([
          ["academy", "Academy"],
          ["fa", "FA"],
          ["rookie", "Prospect"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-1.5 py-0.5 border text-[8px] uppercase tracking-[0.15em] transition-all ${
              tab === id
                ? "border-amber-400/70 text-amber-200 bg-amber-500/10"
                : "border-rift-line/50 text-rift-muted/60 hover:text-rift-mutedbright"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "academy" && (
        <>
          {renderList(
            academyRows,
            "academy",
            "No eligible academy for this lane (same-window demotees excluded).",
            "Call up",
          )}
          {onBrowseBoard && (
            <button
              type="button"
              onClick={() => onBrowseBoard("academy")}
              className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/55 hover:text-rift-goldbright transition-all"
            >
              Open academy board →
            </button>
          )}
        </>
      )}
      {tab === "fa" && (
        <>
          {renderList(
            faRows,
            "fa",
            "No free agents for this lane.",
            "Sign",
          )}
          {onBrowseBoard && (
            <button
              type="button"
              onClick={() => onBrowseBoard("fa")}
              className="text-[8px] uppercase tracking-[0.15em] text-rift-muted/55 hover:text-rift-goldbright transition-all"
            >
              Open FA board →
            </button>
          )}
        </>
      )}
      {tab === "rookie" && (
        <div className="flex flex-wrap items-center gap-2 px-1 py-1">
          <span className="text-[9px] text-rift-muted/70">
            Mint a prospect into academy, then call them up into this lane (academy-first).
          </span>
          <button
            type="button"
            onClick={onRookie}
            className="ml-auto px-2 py-0.5 border border-amber-400/70 bg-amber-500/10 text-amber-200 text-[8px] uppercase tracking-[0.2em] hover:bg-amber-500/20 transition-all"
          >
            Academy prospect
          </button>
        </div>
      )}
    </div>
  );
}
