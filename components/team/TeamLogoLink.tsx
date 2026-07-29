"use client";

import { memo } from "react";

import TeamIcon from "../TeamIcon";
import TeamHoverCard from "./TeamHoverCard";
import { useTeamCardContext, type TeamCardHint } from "./TeamCardContext";

export interface TeamLogoLinkProps {
  teamId?: string;
  seasonId?: string;
  phaseScope?: import("@/lib/season/types").SplitId | import("@/lib/season/types").InternationalId;
  hint?: TeamCardHint;
  /** Match opponent — shows H2H on the hover card when set. */
  opponentTeamId?: string;
  opponentHint?: TeamCardHint;
  name?: string;
  leagueId?: import("@/lib/season/types").LeagueId;
  iconKey?: string;
  logoUrl?: string;
  color?: string;
  size?: number;
  className?: string;
  noNavigate?: boolean;
  renderAs?: "button" | "span";
  /** Native tooltip — only used outside a TeamCardProvider (no hover card). */
  title?: string;
}

const NAV_CLS = "inline-flex shrink-0 hover:opacity-80 transition-opacity";

function TeamLogoLink({
  teamId,
  seasonId,
  phaseScope,
  hint,
  opponentTeamId,
  opponentHint,
  name,
  leagueId,
  iconKey = "shield",
  logoUrl,
  color,
  size = 14,
  className = "",
  noNavigate,
  renderAs = "button",
  title,
}: TeamLogoLinkProps) {
  const ctx = useTeamCardContext();
  const mergedHint: TeamCardHint | undefined =
    hint ??
    (name && leagueId
      ? { name, leagueId, iconKey, ...(logoUrl ? { logoUrl } : {}), ...(color ? { color } : {}) }
      : undefined);

  const displayName = name ?? hint?.name ?? hint?.team?.name ?? "—";
  const navKey =
    mergedHint?.team
      ? `${mergedHint.team.leagueId}:${mergedHint.team.name}`
      : mergedHint?.name && mergedHint.leagueId
        ? `${mergedHint.leagueId}:${mergedHint.name}`
        : undefined;

  const canNavigate =
    renderAs === "button" &&
    !!ctx?.hasProfileNav &&
    !!navKey &&
    !noNavigate &&
    ctx.canOpenProfile(navKey);

  const icon = (
    <TeamIcon
      iconKey={iconKey ?? mergedHint?.iconKey ?? mergedHint?.team?.iconKey ?? "shield"}
      logoUrl={logoUrl ?? mergedHint?.logoUrl ?? mergedHint?.team?.logoUrl}
      color={color ?? mergedHint?.color ?? mergedHint?.team?.color}
      size={size}
      className={`flex-shrink-0 ${className}`}
    />
  );

  if (!ctx) {
    return (
      <span className="inline-flex shrink-0" title={title ?? displayName} aria-label={displayName}>
        {icon}
      </span>
    );
  }

  return (
    <TeamHoverCard
      teamId={teamId}
      seasonId={seasonId}
      phaseScope={phaseScope}
      hint={mergedHint}
      opponentTeamId={opponentTeamId}
      opponentHint={opponentHint}
      className="inline-flex shrink-0"
    >
      {canNavigate ? (
        <button
          type="button"
          aria-label={displayName}
          onClick={() => ctx.openProfile(navKey!)}
          className={NAV_CLS}
        >
          {icon}
        </button>
      ) : (
        <span aria-label={displayName}>
          {icon}
        </span>
      )}
    </TeamHoverCard>
  );
}

export default memo(TeamLogoLink);
