"use client";

/** Polished Golden Road badge — a six- or seven-title sweep in one season. */
export default function GoldenRoadBadge({
  requiresGlobalCup = false,
  compact = false,
  teamName,
}: {
  requiresGlobalCup?: boolean;
  compact?: boolean;
  teamName?: string;
}) {
  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 border border-rift-goldbright/70 bg-gradient-to-r from-rift-gold/15 via-rift-goldbright/20 to-rift-gold/15 px-1.5 py-0.5"
        title={
          requiresGlobalCup
            ? "Golden Road — swept all seven titles"
            : "Golden Road — swept all six titles"
        }
      >
        <span className="font-display text-[10px] tracking-[0.2em] uppercase bg-gold-sheen bg-clip-text text-transparent">
          ★
        </span>
      </span>
    );
  }
  return (
    <div className="inline-block border border-rift-goldbright/70 bg-gradient-to-r from-rift-gold/20 via-rift-goldbright/25 to-rift-gold/20 px-3 py-1.5">
      <span className="font-display text-xs md:text-sm tracking-[0.25em] uppercase bg-gold-sheen bg-clip-text text-transparent">
        ★ Golden Road ★
      </span>
      <div className="text-[8px] uppercase tracking-[0.25em] text-rift-gold/75 mt-0.5">
        {requiresGlobalCup
          ? "Swept all 3 splits + First Stand, MSI, Worlds & Global Cup"
          : "Swept all 3 splits + First Stand, MSI & Worlds"}
        {teamName ? ` · ${teamName}` : ""}
      </div>
    </div>
  );
}
