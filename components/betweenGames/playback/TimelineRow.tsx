"use client";

import { memo } from "react";
import type { MatchEvent } from "@/lib/matchSimulator";
import EventIcon from "@/components/EventIcon";
import { EVENT_LABEL, EMPHASIS_EVENTS } from "../shared";

// Memoized: the event log re-renders every playback state update, but each
// already-revealed row's props (stable event object, team name strings, the
// `isNew` boolean) only change for the newly-revealed row and the previously
// newest row (isNew true→false). Every older row skips re-rendering.
export const TimelineRow = memo(function TimelineRow({
  event,
  blueTeam,
  redTeam,
  isNew,
  link,
}: {
  event: MatchEvent;
  blueTeam: string;
  redTeam: string;
  isNew?: boolean;
  // "off the …" causal tag when this objective came off a recent setup play.
  link?: string | null;
}) {
  const isBlue = event.side === "blue";
  const accentText = isBlue ? "text-rift-bluebright" : "text-rift-redbright";
  const sideTintBg = isBlue
    ? "bg-gradient-to-r from-rift-blue/10 via-rift-blue/[0.03] to-transparent"
    : "bg-gradient-to-l from-rift-red/10 via-rift-red/[0.03] to-transparent";
  const isEmphasis = EMPHASIS_EVENTS.has(event.type);
  const teamLabel = isBlue ? blueTeam : redTeam;
  const totalKills = event.kills.blue + event.kills.red;
  // Side-anchored layout: blue events read left-to-right (icon left, team
  // right); red events read right-to-left. Subtle but it makes the log
  // feel like a broadcast scroll where each side has territory.
  return (
    <div
      className={`relative flex items-center gap-2 md:gap-3 px-2.5 py-1.5 ${sideTintBg} ${
        isEmphasis
          ? "border border-rift-gold/40 bg-rift-gold/5"
          : "border-l-2 border-r border-r-transparent " +
            (isBlue ? "border-l-rift-blue" : "border-l-rift-red")
      } ${isNew ? "animate-[fadeSlide_400ms_ease-out]" : ""} transition-all`}
    >
      {/* Time + event-type capsule */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`font-display text-xs md:text-sm tabular-nums tracking-tight ${
            isEmphasis ? "text-rift-goldbright" : accentText
          } w-11 md:w-12 text-right`}
        >
          {event.time}
        </span>
        <span
          className={`flex items-center justify-center w-7 h-7 md:w-8 md:h-8 border ${
            isEmphasis
              ? "border-rift-gold/60 bg-rift-gold/15 text-rift-goldbright"
              : isBlue
              ? "border-rift-blue/40 bg-rift-blue/10 text-rift-bluebright"
              : "border-rift-red/40 bg-rift-red/10 text-rift-redbright"
          }`}
        >
          <EventIcon type={event.type} size={16} />
        </span>
      </div>

      {/* Description block: type label + flavor text */}
      <div className="flex-1 min-w-0 leading-tight">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={`text-[9px] md:text-[10px] uppercase tracking-[0.25em] ${
              isEmphasis ? "text-rift-goldbright font-display" : accentText
            }`}
          >
            {EVENT_LABEL[event.type]}
          </span>
          {totalKills > 0 && (
            <span className="text-[9px] md:text-[10px] tabular-nums">
              {/* Kill counts no longer tinted by side; use a single
                  fixed palette so K/D/A reads consistently regardless
                  of who scored. Active kills = emerald (good thing
                  happening), zeros stay muted. */}
              <span className={event.kills.blue > 0 ? "text-emerald-300" : "text-rift-muted/60"}>
                {event.kills.blue}K
              </span>
              <span className="text-rift-muted/50 mx-1">·</span>
              <span className={event.kills.red > 0 ? "text-emerald-300" : "text-rift-muted/60"}>
                {event.kills.red}K
              </span>
            </span>
          )}
        </div>
        <div
          title={event.description}
          className={`text-[11px] md:text-xs mt-0.5 break-words ${
            isEmphasis ? "text-rift-goldbright/95" : "text-rift-mutedbright"
          }`}
        >
          {event.description}
        </div>
        {link && (
          <div className="text-[9px] md:text-[10px] mt-0.5 italic text-rift-muted/70">
            ↳ off {link}
          </div>
        )}
      </div>

      {/* Trailing team label */}
      <span
        className={`text-[9px] md:text-[10px] font-display uppercase tracking-[0.2em] ${accentText} flex-shrink-0 hidden sm:inline truncate max-w-[6rem]`}
        title={teamLabel}
      >
        {teamLabel}
      </span>
    </div>
  );
});
