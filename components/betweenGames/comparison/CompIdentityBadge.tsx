"use client";

import { memo } from "react";
import type { Side } from "@/lib/types";

export const CompIdentityBadge = memo(function CompIdentityBadge({
  side,
  label,
}: {
  side: Side;
  label: string | null;
}) {
  const border = side === "blue" ? "border-rift-blue/40" : "border-rift-red/40";
  const text = side === "blue" ? "text-rift-bluebright" : "text-rift-redbright";
  const display = label ?? "No Clear Identity";
  return (
    <div
      className={`border ${border} bg-rift-bg/30 px-3 py-2 text-center ${
        label ? "" : "opacity-60"
      }`}
    >
      <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted">
        Composition
      </div>
      <div
        className={`font-display ${text} uppercase tracking-[0.2em] text-xs md:text-sm mt-1`}
      >
        {display}
      </div>
    </div>
  );
});

export const SynergyStrip = memo(function SynergyStrip({
  side,
  tags,
  bonus,
}: {
  side: Side;
  tags: string[];
  bonus: number;
}) {
  const border = side === "blue" ? "border-rift-blue/30" : "border-rift-red/30";
  if (tags.length === 0) {
    return (
      <div
        className={`border ${border} bg-rift-bg/30 px-3 py-2 text-center opacity-50`}
      >
        <div className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted">
          Synergies
        </div>
        <div className="text-[10px] md:text-xs text-rift-muted/70 italic mt-1">
          None active
        </div>
      </div>
    );
  }
  return (
    <div className={`border ${border} bg-rift-bg/30 px-3 py-2`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-rift-muted">
          Synergies
        </span>
        <span className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] text-rift-goldbright">
          +{bonus}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="text-[8px] md:text-[9px] uppercase tracking-[0.15em] px-1.5 py-px border border-rift-gold/50 bg-gradient-to-r from-rift-gold/10 to-rift-gold/5 text-rift-goldbright"
          >
            ★ {tag}
          </span>
        ))}
      </div>
    </div>
  );
});
