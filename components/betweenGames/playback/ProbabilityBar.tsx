"use client";

import { memo } from "react";

// Memoized: bluePct/redPct only change when an event reveals (win prob is
// event-driven), so this skips the per-clock-update parent renders.
export const ProbabilityBar = memo(function ProbabilityBar({
  bluePct,
  redPct,
}: {
  bluePct: number;
  redPct: number;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] md:text-xs uppercase tracking-[0.3em] mb-1.5">
        <span className="text-rift-bluebright">{bluePct}%</span>
        <span className="text-rift-redbright">{redPct}%</span>
      </div>
      <div className="h-3 md:h-4 bg-rift-bg/60 border border-rift-line flex overflow-hidden">
        <div
          className="bg-gradient-to-r from-rift-bluedeep to-rift-blue transition-[width] duration-700 ease-out"
          style={{ width: `${bluePct}%` }}
        />
        <div
          className="bg-gradient-to-l from-rift-reddeep to-rift-red transition-[width] duration-700 ease-out"
          style={{ width: `${redPct}%` }}
        />
      </div>
    </div>
  );
});
