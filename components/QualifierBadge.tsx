"use client";

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
