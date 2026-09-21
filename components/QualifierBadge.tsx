"use client";
import { normalizeTeamStars } from "@/lib/teamStars";

import {
  INTERNATIONAL_LABELS,
  type InternationalId,
} from "@/lib/season/types";

// Compact, space-safe qualification tags. The long-form strings
// ("First Stand Champion", "Worlds · Points (28) · Play-In") don't fit
// next to team names in tight rows — these render as short pills with
// whitespace-nowrap + flex-shrink-0 so the NAME truncates, never the
// tag, and the full qualification route moves into the tooltip.

const EVENT_SHORT: Record<InternationalId, string> = {
  "first-stand": "FS",
  msi: "MSI",
  worlds: "Worlds",
  "global-cup": "GC",
};

/** Gold trophy pill marking the defending champion of an international
 *  (the additive auto-qualified slot): "🏆 FS" / "🏆 MSI". */
export function IntlChampionBadge({ event }: { event: InternationalId }) {
  return (
    <span
      title={`Defending ${INTERNATIONAL_LABELS[event]} champion — qualified automatically`}
      className="inline-flex items-center gap-1 px-1.5 py-px border border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] leading-tight whitespace-nowrap flex-shrink-0"
    >
      <span aria-hidden className="text-[9px] leading-none">
        🏆
      </span>
      {EVENT_SHORT[event]}
    </span>
  );
}

/** Pill marking a team that bypassed the group/qualifier stage and is
 *  pre-seeded straight into the playoff bracket — a Worlds region #1 seed
 *  that byes the group stage (or, more broadly, any seed-bye team). */
export function DirectQualifierBadge() {
  return (
    <span
      title="Qualified directly to the playoff bracket — byes the group stage"
      className="inline-flex items-center gap-1 px-1.5 py-px border border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright text-[8px] uppercase tracking-[0.2em] leading-tight whitespace-nowrap flex-shrink-0"
    >
      <span aria-hidden className="text-[9px] leading-none">
        ⚡
      </span>
      Direct
    </span>
  );
}

// Star (1-5) → letter tier, matching deriveStar's centering (5★ = S … 1★ = D).
const STAR_TIER = ["D", "C", "B", "A", "S"] as const;

/** Trending-form pill: the team's current tier with a ▲/▼ arrow when its
 *  hot/cold form (the season's formDrift modifier, in [-1, 1]) is pushing
 *  its effective strength up or down. Renders nothing when form is roughly
 *  neutral, so it only appears when there's a real trend to show. */
export function TeamFormBadge({
  form,
  baseStar,
}: {
  form?: number;
  baseStar?: number;
}) {
  if (typeof form !== "number" || Math.abs(form) < 0.12) return null;
  const up = form > 0;
  const star = normalizeTeamStars(baseStar);
  const tier = STAR_TIER[Math.round(star) - 1];
  const signed = `${form > 0 ? "+" : ""}${form.toFixed(2)}`;
  return (
    <span
      title={`${star}/5 stars · ${tier}-tier · ${up ? "trending up" : "trending down"} (form ${signed})`}
      className={`inline-flex items-center gap-0.5 px-1 py-px border text-[8px] uppercase tracking-[0.15em] leading-tight whitespace-nowrap flex-shrink-0 ${
        up
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
          : "border-rift-red/50 bg-rift-red/10 text-rift-redbright"
      }`}
    >
      <span aria-hidden className="leading-none">
        {up ? "▲" : "▼"}
      </span>
      {star}{"\u2605"}
    </span>
  );
}

/** How a team's qualification renders next to its name: a short label
 *  and/or the champion trophy pill, with the detail in the tooltip. */
export interface QualifierTagInfo {
  label?: string;
  /** Tooltip carrying the full qualification route. */
  title?: string;
  /** Set → also render the defending-champion pill for that event. */
  championOf?: InternationalId;
}

export function QualifierTagView({ tag }: { tag?: QualifierTagInfo }) {
  if (!tag) return null;
  return (
    <>
      {tag.label && (
        <span
          title={tag.title}
          className="text-[9px] uppercase tracking-[0.15em] text-rift-gold/60 whitespace-nowrap flex-shrink-0"
        >
          {tag.label}
        </span>
      )}
      {tag.championOf && <IntlChampionBadge event={tag.championOf} />}
    </>
  );
}
