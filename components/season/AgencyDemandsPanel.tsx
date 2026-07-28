"use client";

import {
  formatAgencyWants,
  userFacingAgencyDemands,
  type AgencyDemand,
} from "@/lib/season/franchiseAgency";
import type { AgencyDemandKind } from "@/lib/season/playerAgency";
import { useDraftStore } from "@/store/draftStore";
import LaneIcon from "../LaneIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TierChip from "./TierChip";

const KIND_BADGE: Record<
  AgencyDemandKind,
  { label: string; cls: string }
> = {
  "call-up": {
    label: "Call-up",
    cls: "border-emerald-500/45 text-emerald-300/90 bg-emerald-500/10",
  },
  leave: {
    label: "Leave",
    cls: "border-amber-500/45 text-amber-300/90 bg-amber-500/10",
  },
  "depart-academy": {
    label: "Academy exit",
    cls: "border-sky-500/45 text-sky-300/90 bg-sky-500/10",
  },
};

/**
 * Pending player-agency demands for the followed team during a transfer
 * window or offseason shop. Override keeps the player; Honor lets them leave
 * / call up / depart.
 */
export default function AgencyDemandsPanel() {
  const season = useDraftStore((s) => s.season);
  const honorAgencyDemand = useDraftStore((s) => s.honorAgencyDemand);
  const overrideAgencyDemand = useDraftStore((s) => s.overrideAgencyDemand);

  const controlledId = season?.config.controlledTeamId;
  const demands = userFacingAgencyDemands(
    season?.franchise?.agencyDemands,
    controlledId,
  );

  if (!season?.franchise?.aging || demands.length === 0) return null;

  return (
    <div className="border border-rift-gold/35 bg-rift-gold/[0.06] p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.28em] text-rift-goldbright">
          Player wants
        </span>
        <span className="px-1.5 py-px border border-rift-gold/30 text-[7px] uppercase tracking-[0.12em] text-rift-gold/70 tabular-nums">
          {demands.length} pending
        </span>
      </div>
      <div className="space-y-1.5">
        {demands.map((d) => (
          <AgencyDemandRow
            key={d.id}
            demand={d}
            onOverride={() => overrideAgencyDemand(d.id)}
            onHonor={() => honorAgencyDemand(d.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AgencyDemandRow({
  demand,
  onOverride,
  onHonor,
}: {
  demand: AgencyDemand;
  onOverride: () => void;
  onHonor: () => void;
}) {
  const badge = KIND_BADGE[demand.kind];
  const honorLabel =
    demand.kind === "call-up"
      ? "Call up"
      : demand.kind === "depart-academy"
        ? "Let leave"
        : "Let go";
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 gap-y-1 items-center text-[10px] py-1.5 px-2 border border-rift-line/25 bg-rift-bg/25 border-l-2 border-l-rift-gold/40">
      <div className="flex items-center gap-1.5 shrink-0">
        <LaneIcon lane={demand.lane} size="sm" className="shrink-0" />
        <span className={`px-1 py-px border text-[7px] uppercase tracking-[0.1em] ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <PlayerNameLink
          playerId={demand.playerId}
          name={demand.playerName}
          className="font-medium text-rift-mutedbright truncate max-w-[9rem]"
        />
        <TierChip tier={demand.playerTier} size="xs" />
        <span className="text-[9px] text-rift-muted/55 truncate" title={formatAgencyWants(demand)}>
          {formatAgencyWants(demand)}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOverride}
          className="px-1.5 py-0.5 border border-rift-line/60 text-[8px] uppercase tracking-[0.12em] text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"
          title="Keep this player on your roster / academy"
        >
          Override
        </button>
        <button
          type="button"
          onClick={onHonor}
          className="px-1.5 py-0.5 border border-rift-blue/50 text-[8px] uppercase tracking-[0.12em] text-rift-bluebright hover:bg-rift-blue/10"
          title={
            demand.kind === "call-up"
              ? "Promote to main roster"
              : "Honor the demand and let them leave"
          }
        >
          {honorLabel}
        </button>
      </div>
    </div>
  );
}
