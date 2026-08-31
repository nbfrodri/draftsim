"use client";

import { IconTimeline } from "@tabler/icons-react";

export default function GoToSeasonButton({
  seasonId,
  seasonLabel,
  onGoToSeason,
  title,
}: {
  seasonId: string;
  seasonLabel: string;
  onGoToSeason?: (seasonId: string) => void;
  /** Override default tooltip. */
  title?: string;
}) {
  if (!onGoToSeason || !seasonId) return null;

  const tip = title ?? `View ${seasonLabel} in timeline`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onGoToSeason(seasonId);
      }}
      className="inline-flex items-center justify-center w-4 h-4 flex-shrink-0 border border-rift-line/40 text-rift-muted/50 hover:text-rift-goldbright hover:border-rift-gold/50 transition-colors"
      title={tip}
      aria-label={tip}
    >
      <IconTimeline size={10} stroke={1.6} aria-hidden />
    </button>
  );
}
