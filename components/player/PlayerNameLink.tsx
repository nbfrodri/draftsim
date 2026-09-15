"use client";

import { memo, type ReactNode } from "react";

import PlayerHoverCard from "./PlayerHoverCard";
import {
  usePlayerCardContext,
  type PlayerCardHint,
} from "./PlayerCardContext";

export interface PlayerNameLinkProps {
  /** Stable player id. Without one the name renders plain (no card, no click). */
  playerId?: string;
  name?: string | null;
  /** Archived season entry id — pins the card to that year's snapshot. */
  seasonId?: string;
  phaseScope?: import("@/lib/season/types").SplitId | import("@/lib/season/types").InternationalId;
  /** Data the call site already has that the resolver can't cheaply derive. */
  hint?: PlayerCardHint;
  /** Shown when `name` is empty. */
  fallback?: string;
  className?: string;
  /** Suppress click-to-profile while keeping the hover card. */
  noNavigate?: boolean;
  /** Use a span trigger when nested inside another button (expand rows, etc.). */
  renderAs?: "button" | "span";
  title?: string;
  /** Replaces the rendered label (badges, icons) — the card is unaffected. */
  children?: ReactNode;
}

const NAV_CLS =
  "hover:text-rift-goldbright transition-colors text-left min-w-0 truncate cursor-pointer";

/**
 * Every player name in the app goes through here: it hangs a
 * {@link PlayerHoverCard} off the name and, where a Hall profile exists, makes
 * the name itself the link to it. Degrades to a plain `<span>` outside a
 * `PlayerCardProvider`, so it is always safe to swap in for a bare name.
 */
function PlayerNameLink({
  playerId,
  name,
  seasonId,
  phaseScope,
  hint,
  fallback = "—",
  className = "",
  noNavigate,
  renderAs = "button",
  title,
  children,
}: PlayerNameLinkProps) {
  const ctx = usePlayerCardContext();
  const label = children ?? name ?? fallback;
  const canNavigate =
    renderAs === "button" &&
    !!ctx?.hasProfileNav &&
    !!playerId &&
    !noNavigate &&
    ctx.canOpenProfile(playerId);

  if (!ctx) {
    return (
      <span className={className} title={title}>
        {label}
      </span>
    );
  }

  return (
    <PlayerHoverCard
      playerId={playerId}
      seasonId={seasonId}
      phaseScope={phaseScope}
      hint={hint}
      className={className}
    >
      {canNavigate ? (
        <button
          type="button"
          title={title}
          onClick={() => ctx.openProfile(playerId!)}
          className={NAV_CLS}
        >
          {label}
        </button>
      ) : (
        <span className="min-w-0 truncate" title={title}>
          {label}
        </span>
      )}
    </PlayerHoverCard>
  );
}

export default memo(PlayerNameLink);
