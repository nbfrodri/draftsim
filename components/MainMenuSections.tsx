"use client";

import {
  IconArrowRight,
  IconSwords,
  IconTournament,
  IconCalendar,
  IconWorld,
  IconListDetails,
  IconArrowsShuffle,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

type Destination =
  | "single-setup"
  | "tournament-setup"
  | "season-setup"
  | "realities-hub"
  | "meta-library"
  | "pairings-library";

export default function MainMenuSections({
  onChoose,
  onSeason,
  hasSeason,
  realitiesCount,
  resume,
}: {
  onChoose: (view: Destination) => void;
  onSeason: () => void;
  hasSeason: boolean;
  realitiesCount: number;
  resume?: { name: string; detail: string; onClick: () => void };
}) {
  const modes: {
    title: string;
    eyebrow: string;
    description: string;
    icon: ComponentType<{ size?: number; className?: string }>;
    onClick: () => void;
  }[] = [
    {
      title: "Realities",
      eyebrow: "Career",
      description:
        "Build a living timeline of teams, transfers and champions across seasons.",
      icon: IconWorld,
      onClick: () => onChoose("realities-hub"),
    },
    {
      title: "Season Mode",
      eyebrow: hasSeason ? "Current" : "New",
      description:
        "One competitive year. Six leagues, three splits and international titles.",
      icon: IconCalendar,
      onClick: onSeason,
    },
    {
      title: "Single Series",
      eyebrow: "Solo",
      description:
        "Draft and play a Bo1, Bo3 or Bo5. Face a friend, the AI, or watch it unfold.",
      icon: IconSwords,
      onClick: () => onChoose("single-setup"),
    },
    {
      title: "Tournament",
      eyebrow: "Bracket",
      description: "Build your field, choose a format and crown a champion.",
      icon: IconTournament,
      onClick: () => onChoose("tournament-setup"),
    },
  ];
  return (
    <>
      {resume && (
        <section aria-label="Continue playing" className="mb-6">
          <button
            type="button"
            onClick={resume.onClick}
            className="group w-full border border-rift-gold/50 bg-rift-gold/[0.05] p-5 md:p-6 text-left transition-colors hover:border-rift-gold hover:bg-rift-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rift-gold"
          >
            <div className="flex items-center justify-between gap-5">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.25em] text-rift-gold mb-2">
                  Continue playing
                </div>
                <div className="font-display text-2xl md:text-3xl text-rift-goldbright break-words">
                  {resume.name}
                </div>
                <div className="mt-2 text-xs text-rift-mutedbright">
                  {resume.detail}
                </div>
              </div>
              <IconArrowRight
                size={24}
                className="shrink-0 text-rift-gold"
                aria-hidden="true"
              />
            </div>
          </button>
        </section>
      )}
      <section aria-labelledby="menu-modes">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="menu-modes"
            className="text-xs uppercase tracking-[0.25em] text-rift-gold"
          >
            Game modes
          </h2>
          {realitiesCount > 0 && (
            <span className="text-xs text-rift-muted">
              {realitiesCount} saved{" "}
              {realitiesCount === 1 ? "reality" : "realities"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modes.map(({ title, eyebrow, description, icon: Icon, onClick }) => (
            <button
              key={title}
              type="button"
              onClick={onClick}
              className="group border border-rift-line bg-rift-bg/30 hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-colors p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright">
                  {eyebrow}
                </span>
                <Icon size={20} className="text-rift-gold/70" />
              </div>
              <div className="font-display text-xl text-rift-goldbright mb-2">
                {title}
              </div>
              <p className="text-xs leading-relaxed text-rift-mutedbright">
                {description}
              </p>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="menu-tools" className="mt-6">
        <h2
          id="menu-tools"
          className="mb-3 text-xs uppercase tracking-[0.25em] text-rift-gold"
        >
          Tools & libraries
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              title: "Meta Tier Lists",
              description: "Create and manage custom champion tier lists.",
              view: "meta-library" as const,
              icon: IconListDetails,
            },
            {
              title: "Synergies & Counters",
              description:
                "Shape the pairings and counterpicks used in your games.",
              view: "pairings-library" as const,
              icon: IconArrowsShuffle,
            },
          ].map(({ title, description, view, icon: Icon }) => (
            <button
              key={view}
              type="button"
              onClick={() => onChoose(view)}
              className="flex items-center gap-4 border border-rift-line p-4 text-left hover:border-rift-gold/60 hover:bg-rift-gold/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rift-gold"
            >
              <Icon
                size={20}
                className="shrink-0 text-rift-mutedbright"
                aria-hidden="true"
              />
              <span>
                <span className="block font-display text-base text-rift-goldbright">
                  {title}
                </span>
                <span className="block mt-1 text-xs text-rift-mutedbright">
                  {description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
