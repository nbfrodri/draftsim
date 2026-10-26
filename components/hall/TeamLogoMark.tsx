"use client";

import { useState } from "react";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import type { LeagueId } from "@/lib/season/types";
import RegionMark from "../RegionMark";

/** Recorded artwork takes precedence; unknown or failed logos fall back to the region. */
export default function TeamLogoMark({ teamName, leagueId, logoUrl, size = 16 }: { teamName: string; leagueId?: LeagueId; logoUrl?: string; size?: number }) {
	const src = logoUrl || resolveTeamLogo(teamName);
	const label = leagueId ? `${teamName} (${leagueId})` : teamName;
	const [failedSrc, setFailedSrc] = useState<string>();
	return src && src !== failedSrc ? <img src={src} alt={label} title={label} width={size} height={size} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} className="shrink-0 object-contain" style={{ width: size, height: size }} /> : <RegionMark league={leagueId} size={size} />;
}
