"use client";

import { memo, useState } from "react";
import GlobalCupBadge from "@/components/GlobalCupBadge";
import type { LeagueId, InternationalId } from "@/lib/season/types";

// Region/league OR international-event logo, bundled offline under
// public/league-logos/<id>.png (LeagueId: LCK…; InternationalId:
// first-stand/msi/worlds). On a load error we render nothing so a missing
// file never leaves a broken-image box next to the label.
function LeagueIcon({
  league,
  size = 14,
  className = "",
}: {
  league: LeagueId | InternationalId;
  size?: number;
  className?: string;
}) {
  // Store WHICH league failed rather than a boolean + reset effect: the Hall
  // of Seasons mounts thousands of these, and an effect per icon is pure
  // overhead on every mount.
  const [failedFor, setFailedFor] = useState<string | null>(null);
  if (league === "global-cup") {
    return <GlobalCupBadge size={size} className={className} />;
  }
  if (failedFor === league) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static bundled
    // asset; next/image offers no win for a tiny inline mark.
    <img
      src={`/league-logos/${league}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      onError={() => setFailedFor(league)}
    />
  );
}

export default memo(LeagueIcon);
