import { pairChemistry, playerChemistry, projectedChemistry } from "@/lib/chemistry";
import type { Lane, Player, Roster } from "@/lib/types";

// Shared display for player teammate chemistry (lib/chemistry.ts). Used in the
// roster browser (full breakdown) and the transfer window (overall score), so
// the user can see which duos click and which weak link to trade.

const LANE_ABBR: Record<Lane, string> = {
  top: "Top",
  jungle: "Jgl",
  middle: "Mid",
  bottom: "Bot",
  support: "Sup",
};

export function chemTone(v: number): string {
  if (v >= 0.25) return "text-emerald-400";
  if (v > 0) return "text-emerald-400/60";
  if (v <= -0.25) return "text-rift-redbright";
  if (v < 0) return "text-rift-redbright/60";
  return "text-rift-muted/50";
}

export const fmtChem = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(2);

// One-line summary of a player's pair chemistry, for a title tooltip.
export function chemSummary(me: Player, roster: Roster): string {
  return roster
    .filter((o) => o !== me)
    .map((o) => `${LANE_ABBR[o.lane]}${o.name ? ` ${o.name}` : ""} ${fmtChem(pairChemistry(me, o))}`)
    .join(" · ");
}

// Compact "Chemistry +0.3" badge — overall roster chemistry for one player.
export function ChemScore({ me, roster }: { me: Player; roster: Roster }) {
  if (roster.filter((o) => o !== me).length === 0) return null;
  const overall = playerChemistry(roster, me.lane);
  return (
    <span
      className={`text-[9px] uppercase tracking-[0.15em] tabular-nums ${chemTone(overall)}`}
      title={`Roster chemistry · ${chemSummary(me, roster)}`}
    >
      chem {fmtChem(overall)}
    </span>
  );
}

// "~chem +0.2" badge for a transfer candidate — projected fit if signed.
export function ProjectedChemScore({
  roster,
  incoming,
  lane,
}: {
  roster: Roster;
  incoming: Player;
  lane: Lane;
}) {
  const v = projectedChemistry(roster, incoming, lane);
  return (
    <span
      className={`text-[9px] uppercase tracking-[0.15em] tabular-nums ${chemTone(v)}`}
      title={`Projected roster chemistry if signed · ${chemSummary({ ...incoming, lane }, [...roster.filter((p) => p.lane !== lane), { ...incoming, lane }])}`}
    >
      ~chem {fmtChem(v)}
    </span>
  );
}

// Full per-teammate breakdown, for the expanded player inspector.
export function ChemistryBreakdown({ me, roster }: { me: Player; roster: Roster }) {
  const mates = roster.filter((o) => o !== me);
  if (mates.length === 0) return null;
  const overall = playerChemistry(roster, me.lane);
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.25em] text-rift-blue/55 mb-0.5">
        Chemistry{" "}
        <span className={`tabular-nums ${chemTone(overall)}`}>{fmtChem(overall)}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        {mates.map((o) => {
          const v = pairChemistry(me, o);
          return (
            <span key={o.id ?? o.lane} className="inline-flex items-center gap-1">
              <span className="text-rift-muted/55">
                {LANE_ABBR[o.lane]}
                {o.name ? ` ${o.name}` : ""}
              </span>
              <span className={`tabular-nums ${chemTone(v)}`}>{fmtChem(v)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
