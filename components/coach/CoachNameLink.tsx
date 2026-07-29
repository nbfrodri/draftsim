"use client";

import { memo, type ReactNode } from "react";

import CoachHoverCard from "./CoachHoverCard";
import { useCoachCardContext, type CoachCardHint } from "./CoachCardContext";

export interface CoachNameLinkProps {
  /** Coach display name — Hall profiles are keyed by name. */
  name?: string | null;
  /** Archived season entry id — pins the card to that year's snapshot. */
  seasonId?: string;
  hint?: CoachCardHint;
  fallback?: string;
  className?: string;
  /** Suppress click-to-profile while keeping the hover card. */
  noNavigate?: boolean;
  /** Use a span trigger when nested inside another button. */
  renderAs?: "button" | "span";
  /** Native tooltip — only used outside a CoachCardProvider (no hover card). */
  title?: string;
  children?: ReactNode;
}

const NAV_CLS =
  "hover:text-rift-goldbright transition-colors text-left min-w-0 truncate cursor-pointer";

/**
 * Every coach name in the app goes through here: hover card + Hall profile
 * link when a provider is mounted. Degrades to a plain span otherwise.
 */
function CoachNameLink({
  name,
  seasonId,
  hint,
  fallback = "—",
  className = "",
  noNavigate,
  renderAs = "button",
  title,
  children,
}: CoachNameLinkProps) {
  const ctx = useCoachCardContext();
  const label = children ?? name ?? fallback;
  const coachName = name?.trim() || hint?.coach?.name || hint?.name;
  const canNavigate =
    renderAs === "button" &&
    !!ctx?.hasProfileNav &&
    !!coachName &&
    !noNavigate &&
    ctx.canOpenProfile(coachName);

  if (!ctx) {
    return (
      <span className={className} title={title}>
        {label}
      </span>
    );
  }

  return (
    <CoachHoverCard
      coachName={coachName}
      seasonId={seasonId}
      hint={hint}
      className={className}
    >
      {canNavigate ? (
        <button
          type="button"
          onClick={() => ctx.openProfile(coachName!)}
          className={NAV_CLS}
        >
          {label}
        </button>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
    </CoachHoverCard>
  );
}

export default memo(CoachNameLink);
