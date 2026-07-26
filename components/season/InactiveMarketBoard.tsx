"use client";

import { useEffect, useState } from "react";

import {
  ACADEMY_MAX_PER_TEAM,
  USER_ACADEMY_ROOKIE_SOFT_MAX,
  FA_OPEN_REPLACE_GAP,
  ACADEMY_OPEN_REPLACE_GAP,
  USER_MAX_FA_SIGNS,
  type FaBoardRow,
} from "@/lib/season/faMarket";
import { LANE_ORDER } from "@/lib/players";
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

export type InactiveBoardKind = "fa" | "academy";

interface Props {
  kind: InactiveBoardKind;
  board: FaBoardRow[];
  recommended: FaBoardRow[];
  signsUsed: number;
  /** Followed-team academy occupancy (for Academy N/5 + sign-to-academy gate). */
  academyCount: number;
  onSign: (lane: Lane, playerId: string) => void;
  /** FA board: park FA in academy instead of main roster. */
  onSignToAcademy?: (playerId: string) => void;
  /** Academy board: release player to free agency. */
  onReleaseToFa?: (playerId: string) => void;
  /** Academy board: mint a rookie into academy when there is room. */
  onAddAcademyRookie?: () => void;
  /**
   * Academy call-up block list (same-window demotees). Still shown on the board
   * so benched players appear under Academy N/5; Call up is disabled.
   */
  blockedCallUpIds?: ReadonlySet<string>;
  /** Default open. */
  defaultOpen?: boolean;
  /** When set, open the board and filter to this lane (vacancy deep-link). */
  focusLane?: Lane | null;
}

/**
 * Shared Free-agent / Academy board for offseason + mid-season transfer window.
 * Rows use InactiveBoardTip for rift popovers; action buttons stay outside the tip.
 */
export default function InactiveMarketBoard({
  kind,
  board,
  recommended,
  signsUsed,
  academyCount,
  onSign,
  onSignToAcademy,
  onReleaseToFa,
  onAddAcademyRookie,
  blockedCallUpIds,
  defaultOpen = true,
  focusLane = null,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [lane, setLane] = useState<Lane | "all">("all");

  useEffect(() => {
    if (!focusLane) return;
    setOpen(true);
    setLane(focusLane);
  }, [focusLane]);

  const isFa = kind === "fa";
  const title = isFa ? "Free-agent board" : "Academy board";
  const empty = isFa ? "No free agents in the pool." : "No academy players for your org.";
  const action = isFa ? "Sign" : "Call up";
  const actionOk = isFa
    ? "Sign this FA (releases your current player to academy, or fills a vacant slot)"
    : "Call up this academy player (releases your current player to academy, or fills a vacant slot)";
  const replaceGap = isFa ? FA_OPEN_REPLACE_GAP : ACADEMY_OPEN_REPLACE_GAP;
  const filtered =
    lane === "all" ? board : board.filter((r) => r.entry.player.lane === lane);
  const recFiltered =
    lane === "all"
      ? recommended
      : recommended.filter((r) => r.entry.player.lane === lane);

  const academyFull = academyCount >= ACADEMY_MAX_PER_TEAM;
  const academyRookieSoftFull = academyCount >= USER_ACADEMY_ROOKIE_SOFT_MAX;
  const canAct = (row: FaBoardRow) =>
    signsUsed < USER_MAX_FA_SIGNS && (row.upgradeVsSlot ?? 0) >= replaceGap;
  const canSignToAcademy =
    isFa &&
    !!onSignToAcademy &&
    signsUsed < USER_MAX_FA_SIGNS &&
    !academyFull;
  const canRelease = !isFa && !!onReleaseToFa;

  const renderRow = (row: FaBoardRow, featured: boolean) => {
    const p = row.entry.player;
    const sameWindowBlock =
      !isFa && !!p.id && !!blockedCallUpIds?.has(p.id);
    const ok = canAct(row) && !sameWindowBlock;
    return (
      <div
        key={`${kind}-${p.id}-${featured ? "rec" : "list"}`}
        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] ${
          featured
            ? "border border-emerald-500/25 bg-emerald-500/[0.04] px-2 py-1"
            : `px-1.5 py-0.5 ${row.recommended ? "bg-emerald-500/[0.03]" : ""}`
        }`}
      >
        <InactiveBoardTip row={row}>
          <LaneIcon lane={p.lane} size="xs" className="shrink-0" />
          <span className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}>
            {p.tier}
          </span>
          <span className="text-rift-mutedbright truncate max-w-[100px]">{p.name}</span>
          {!featured && row.recommended && (
            <span className="text-[7px] uppercase tracking-[0.15em] text-emerald-400/80">rec</span>
          )}
          <span className="text-[8px] text-rift-muted/55 tabular-nums">
            {featured ? `val ${row.value.toFixed(1)}` : row.value.toFixed(1)}
            {row.upgradeVsSlot != null && (
              <span
                className={
                  row.upgradeVsSlot >= replaceGap
                    ? "text-emerald-400/90"
                    : "text-rift-muted/45"
                }
              >
                {" "}
                {featured ? "· " : ""}
                {row.upgradeVsSlot >= 0 ? "+" : ""}
                {row.upgradeVsSlot.toFixed(1)}
              </span>
            )}
          </span>
          {featured ? (
            <span className="text-[8px] text-rift-muted/45">
              t{row.breakdown.tier.toFixed(1)} / f{row.breakdown.form.toFixed(1)} / m
              {row.breakdown.metaFit.toFixed(1)}
            </span>
          ) : (
            <span className="text-[8px] text-rift-muted/40">
              {isFa
                ? `${row.yearsLeftToRetire}y left`
                : `${Math.max(1, row.entry.inactiveYears < 1 ? 1 : row.entry.inactiveYears)}y · ${row.yearsLeftToFa}y→FA`}
            </span>
          )}
        </InactiveBoardTip>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {canRelease && (
            <button
              type="button"
              disabled={!p.id}
              onClick={() => p.id && onReleaseToFa?.(p.id)}
              title="Release this academy player to free agency"
              className="px-1.5 py-0.5 text-[8px] uppercase tracking-[0.15em] border border-rift-line/60 text-rift-muted/70 hover:border-amber-500/50 hover:text-amber-300/90 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
            >
              Release to FA
            </button>
          )}
          {isFa && onSignToAcademy && (
            <button
              type="button"
              disabled={!canSignToAcademy || !p.id}
              onClick={() => p.id && onSignToAcademy(p.id)}
              title={
                academyFull
                  ? `Academy full (${academyCount}/${ACADEMY_MAX_PER_TEAM}) — release someone first`
                  : signsUsed >= USER_MAX_FA_SIGNS
                    ? "FA sign budget used this window"
                    : "Sign this FA to your academy (not main roster)"
              }
              className="px-1.5 py-0.5 text-[8px] uppercase tracking-[0.15em] border border-rift-line/60 text-rift-muted/70 hover:border-rift-gold/50 hover:text-rift-goldbright transition-all disabled:opacity-35 disabled:cursor-not-allowed"
            >
              Sign to academy
            </button>
          )}
          <button
            type="button"
            disabled={!ok || !p.id}
            onClick={() => p.id && onSign(p.lane, p.id)}
            title={
              sameWindowBlock
                ? "Benched this window — cannot call up until the next shopping window"
                : ok
                  ? actionOk
                  : `Need +${replaceGap} value over your slot`
            }
            className={`px-2 py-0.5 text-[8px] uppercase tracking-[0.2em] transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
              featured
                ? "border border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright hover:bg-rift-gold/20"
                : "border border-rift-line text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"
            }`}
          >
            {action}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-2 border-t border-rift-gold/15 pt-2">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-[9px] uppercase tracking-[0.25em] text-rift-gold/70">{title}</span>
        <span className="text-[8px] uppercase tracking-[0.2em] text-rift-muted/55 tabular-nums">
          Academy {academyCount}/{ACADEMY_MAX_PER_TEAM}
          <span className="text-rift-muted/40"> · </span>
          {signsUsed}/{USER_MAX_FA_SIGNS} signed
          <span className="text-rift-muted/40"> · gap ≥{replaceGap}</span>
        </span>
        {!isFa && onAddAcademyRookie && !academyRookieSoftFull && (
          <button
            type="button"
            onClick={onAddAcademyRookie}
            title={`Generate a rookie into academy (soft cap ${USER_ACADEMY_ROOKIE_SOFT_MAX}/${ACADEMY_MAX_PER_TEAM})`}
            className="px-1.5 py-0.5 border border-rift-line/60 text-rift-muted/70 text-[8px] uppercase tracking-[0.15em] hover:border-emerald-500/50 hover:text-emerald-400/90 transition-all"
          >
            Add academy rookie
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto px-2 py-0.5 border border-rift-line text-rift-mutedbright text-[8px] uppercase tracking-[0.2em] hover:border-rift-gold/50 hover:text-rift-goldbright transition-all"
        >
          {open ? "Hide" : "Show board"}
        </button>
      </div>
      {open && (
        <div className="space-y-2">
          {recFiltered.length > 0 && (
            <div>
              <div className="text-[8px] uppercase tracking-[0.25em] text-emerald-400/70 mb-1">
                Recommended for you
              </div>
              <div className="space-y-1">{recFiltered.slice(0, 5).map((r) => renderRow(r, true))}</div>
            </div>
          )}
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
          </div>
          {filtered.length === 0 ? (
            <div className="text-[9px] italic text-rift-muted">{empty}</div>
          ) : (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {filtered.slice(0, 24).map((r) => renderRow(r, false))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
