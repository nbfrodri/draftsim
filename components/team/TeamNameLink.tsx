"use client";

import { memo, type ReactNode } from "react";

import TeamIcon from "../TeamIcon";
import TeamHoverCard from "./TeamHoverCard";
import { useTeamCardContext, type TeamCardHint } from "./TeamCardContext";

export interface TeamNameLinkProps {
  teamId?: string;
  name?: string | null;
  leagueId?: import("@/lib/season/types").LeagueId;
  seasonId?: string;
  hint?: TeamCardHint;
  iconKey?: string;
  logoUrl?: string;
  color?: string;
  showLogo?: boolean;
  logoSize?: number;
  fallback?: string;
  className?: string;
  noNavigate?: boolean;
  renderAs?: "button" | "span";
  /** Native tooltip — only used outside a TeamCardProvider (no hover card). */
  title?: string;
  children?: ReactNode;
}

const NAV_CLS =
  "hover:text-rift-goldbright transition-colors text-left min-w-0 truncate cursor-pointer inline-flex items-center gap-1.5";

function TeamNameLink({
  teamId,
  name,
  leagueId,
  seasonId,
  hint,
  iconKey,
  logoUrl,
  color,
  showLogo = true,
  logoSize = 14,
  fallback = "—",
  className = "",
  noNavigate,
  renderAs = "button",
  title,
  children,
}: TeamNameLinkProps) {
  const ctx = useTeamCardContext();
  const label = children ?? name ?? fallback;
  const mergedHint: TeamCardHint | undefined =
    hint ??
    (name && leagueId
      ? {
          name,
          leagueId,
          ...(iconKey ? { iconKey } : {}),
          ...(logoUrl ? { logoUrl } : {}),
          ...(color ? { color } : {}),
        }
      : undefined);

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

  const inner = (
    <>
      {showLogo && (logoUrl || iconKey || mergedHint) && (
        <TeamIcon
          iconKey={iconKey ?? mergedHint?.iconKey ?? mergedHint?.team?.iconKey ?? "shield"}
          logoUrl={logoUrl ?? mergedHint?.logoUrl ?? mergedHint?.team?.logoUrl}
          color={color ?? mergedHint?.color ?? mergedHint?.team?.color}
          size={logoSize}
          className="shrink-0"
        />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  if (!ctx) {
    return (
      <span className={className} title={title}>
        {inner}
      </span>
    );
  }

  return (
    <TeamHoverCard
      teamId={teamId}
      seasonId={seasonId}
      hint={mergedHint}
      className={className}
    >
      {canNavigate ? (
        <button
          type="button"
          onClick={() => ctx.openProfile(navKey!)}
          className={NAV_CLS}
        >
          {inner}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          {inner}
        </span>
      )}
    </TeamHoverCard>
  );
}

export default memo(TeamNameLink);
