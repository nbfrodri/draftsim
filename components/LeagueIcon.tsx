"use client";

import { useEffect, useState } from "react";
import GlobalCupBadge from "@/components/GlobalCupBadge";
import type { LeagueId, InternationalId } from "@/lib/season/types";

// Region/league OR international-event logo, bundled offline under
// public/league-logos/<id>.png (LeagueId: LCK…; InternationalId:
// first-stand/msi/worlds). On a load error we render nothing so a missing
// file never leaves a broken-image box next to the label.
export default function LeagueIcon({
  league,
  size = 14,
  className = "",
}: {
  league: LeagueId | InternationalId;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [league]);
  if (league === "global-cup") {
    return <GlobalCupBadge size={size} className={className} />;
  }
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static bundled
    // asset; next/image offers no win for a tiny inline mark.
    <img
      src={`/league-logos/${league}.png`}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      onError={() => setFailed(true)}
    />
  );
}
