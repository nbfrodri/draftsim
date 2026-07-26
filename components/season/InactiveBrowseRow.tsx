"use client";

import type { ReactNode } from "react";

import {
  yearsLeftToFa,
  yearsLeftToRetire,
  type MarketInactive,
} from "@/lib/season/faMarket";
import { ACADEMY_YEARS, ACADEMY_YEARS_MAX } from "@/lib/season/playerLifecycle";
import type { PlayerTier } from "@/lib/types";
import LaneIcon from "@/components/LaneIcon";

const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

/** FA year badge: inactiveYears is 1-based from demotion; academy = soft ACADEMY_YEARS offset. */
function faYears(entry: MarketInactive): number {
  return Math.max(1, entry.inactiveYears - ACADEMY_YEARS);
}

function academyYears(entry: MarketInactive): number {
  return Math.min(ACADEMY_YEARS_MAX, Math.max(1, entry.inactiveYears));
}

interface Props {
  entry: MarketInactive;
  /** Show last club for FA browse. */
  showLastTeam?: boolean;
  /** Optional trailing actions (Release / Call up). */
  actions?: ReactNode;
}

/**
 * Browse-only inactive row shared by Team Browser academy, FA panel, My Team.
 */
export default function InactiveBrowseRow({
  entry,
  showLastTeam = false,
  actions,
}: Props) {
  const p = entry.player;
  const isAcademy = entry.status === "academy";
  const years = isAcademy ? academyYears(entry) : faYears(entry);
  const toFa = isAcademy ? yearsLeftToFa(entry) : null;
  const toRetire = !isAcademy ? yearsLeftToRetire(entry) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 text-[10px]">
      <LaneIcon lane={p.lane} size="xs" className="shrink-0" />
      <span className={`w-5 text-center border font-display ${TIER_CLS[p.tier]}`}>
        {p.tier}
      </span>
      <span className="text-rift-mutedbright truncate max-w-[110px]" title={p.name}>
        {p.name ?? "—"}
      </span>
      <span
        className={`text-[7px] uppercase tracking-[0.15em] px-1 border ${
          isAcademy
            ? "border-amber-500/50 text-amber-300/90 bg-amber-500/10"
            : "border-sky-500/45 text-sky-300/90 bg-sky-500/10"
        }`}
        title={isAcademy ? `Academy · ${years}y` : `Free agent · ${years}y`}
      >
        {isAcademy ? `Acy · ${years}y` : `FA · ${years}y`}
      </span>
      {toFa != null && (
        <span className="text-[8px] text-rift-muted/50 tabular-nums">{toFa}y→FA</span>
      )}
      {toRetire != null && (
        <span className="text-[8px] text-rift-muted/50 tabular-nums">{toRetire}y→ret</span>
      )}
      {p.age != null && (
        <span className="text-[8px] text-rift-muted/45">age {p.age}</span>
      )}
      {showLastTeam && entry.lastTeamName && (
        <span className="text-[8px] text-rift-muted/45 truncate max-w-[90px]" title={entry.lastTeamName}>
          ex {entry.lastTeamName}
        </span>
      )}
      {actions && <div className="ml-auto flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}
