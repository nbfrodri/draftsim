"use client";

import type { SeasonStory, StoryTeamRef } from "@/lib/season/seasonStory";
import { LEAGUE_NAMES } from "@/lib/season/types";
import TeamIcon from "./TeamIcon";

// Renders the templated per-season "story" recap: champion's headline,
// biggest upset, team of the year, region that rose, and the meta arc.
// Every line is conditional, so a sparse story just shows fewer of them.

function TeamChip({ team }: { team: StoryTeamRef }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <TeamIcon
        iconKey={team.iconKey}
        logoUrl={team.logoUrl}
        size={12}
        color={team.color}
      />
      <span className="text-rift-bright">{team.name}</span>
    </span>
  );
}

function StoryLine({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-[11px] leading-relaxed text-rift-mutedbright">
      <span aria-hidden className="flex-shrink-0">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}

export default function SeasonStoryCard({
  story,
  title = "The Story of the Season",
}: {
  story: SeasonStory;
  title?: string;
}) {
  const {
    champion,
    runnerUp,
    biggestUpset,
    teamOfTheYear,
    regionThatRose,
    metaArc,
  } = story;
  // Nothing worth telling — render nothing rather than an empty card.
  if (
    !champion &&
    !biggestUpset &&
    !teamOfTheYear &&
    !regionThatRose &&
    !metaArc
  ) {
    return null;
  }
  return (
    <div className="mb-8">
      <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-2">
        {title}
      </div>
      <div className="space-y-1.5 border border-rift-line/40 bg-rift-bg/30 px-3 py-3">
        {champion && (
          <StoryLine icon="🏆">
            <TeamChip team={champion} /> were crowned World Champions
            {runnerUp ? (
              <>
                {" "}
                — beating <TeamChip team={runnerUp} /> in the final.
              </>
            ) : (
              "."
            )}
          </StoryLine>
        )}
        {biggestUpset && (
          <StoryLine icon="⚡">
            Biggest upset: <TeamChip team={biggestUpset.winner} /> stunned{" "}
            <TeamChip team={biggestUpset.loser} /> — a {biggestUpset.starGap}★
            gap{" "}
            {biggestUpset.round
              ? `in the ${biggestUpset.event} ${biggestUpset.round}`
              : `at ${biggestUpset.event}`}
            .
          </StoryLine>
        )}
        {teamOfTheYear && (
          <StoryLine icon="👑">
            Team of the year: <TeamChip team={teamOfTheYear.team} /> —{" "}
            {teamOfTheYear.titles}{" "}
            {teamOfTheYear.titles === 1 ? "title" : "titles"}.
          </StoryLine>
        )}
        {regionThatRose && (
          <StoryLine icon="📈">
            {LEAGUE_NAMES[regionThatRose]} rose highest this year.
          </StoryLine>
        )}
        {metaArc && (
          <StoryLine icon="🔁">
            Meta shift: {metaArc.alias} ({metaArc.lane}) {metaArc.from} →{" "}
            {metaArc.to}.
          </StoryLine>
        )}
      </div>
    </div>
  );
}
