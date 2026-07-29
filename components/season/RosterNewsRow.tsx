"use client";

import type { RosterNewsEvent } from "@/lib/season/playerLifecycle";
import type { PlayerTier, Lane } from "@/lib/types";
import { useDraftStore } from "@/store/draftStore";
import { findLivePlayerForCard } from "@/lib/season/playerCard";
import TeamLogoLink from "@/components/team/TeamLogoLink";
import LaneIcon from "@/components/LaneIcon";
import PlayerNameLink from "@/components/player/PlayerNameLink";
import TierChip from "./TierChip";

export type RosterNewsItem = RosterNewsEvent & { teamId: string };

export type RosterNewsKind =
  | "retire"
  | "free-agent"
  | "academy-sign"
  | "demote-pending"
  | "swap";

const KIND_BADGE: Record<
  RosterNewsKind,
  { label: string; cls: string }
> = {
  retire: {
    label: "Retired",
    cls: "border-rift-line/50 text-rift-muted/70 bg-rift-bg/40",
  },
  "free-agent": {
    label: "Free agent",
    cls: "border-amber-500/45 text-amber-300/90 bg-amber-500/10",
  },
  "academy-sign": {
    label: "Academy",
    cls: "border-sky-500/45 text-sky-300/90 bg-sky-500/10",
  },
  "demote-pending": {
    label: "Open slot",
    cls: "border-amber-500/40 text-amber-200/80 bg-amber-500/[0.06] border-dashed",
  },
  swap: {
    label: "Roster",
    cls: "border-emerald-500/40 text-emerald-300/90 bg-emerald-500/10",
  },
};

const SOURCE_BADGE: Record<
  NonNullable<RosterNewsEvent["entrantSource"]>,
  { label: string; cls: string }
> = {
  rookie: {
    label: "Debut",
    cls: "border-emerald-500/50 text-emerald-400/90 bg-emerald-500/10",
  },
  academy: {
    label: "Call-up",
    cls: "border-sky-500/45 text-sky-300/90 bg-sky-500/10",
  },
  "free-agent": {
    label: "Return",
    cls: "border-rift-blue/45 text-rift-bluebright/90 bg-rift-blue/10",
  },
};

export function classifyRosterNews(n: RosterNewsEvent): RosterNewsKind {
  if (n.marketNote === "retired") return "retire";
  if (
    n.marketNote === "academy-release" ||
    n.marketNote === "became-fa" ||
    n.marketNote === "academy-bump"
  ) {
    return "free-agent";
  }
  if (
    n.marketNote === "fa-academy" ||
    n.marketNote === "academy-stash" ||
    n.marketNote === "academy-rookie"
  ) {
    return "academy-sign";
  }
  if (n.marketNote === "manual-demote" || n.marketNote === "ai-demote") {
    return "demote-pending";
  }
  return "swap";
}

function bidNote(n: RosterNewsEvent): string | null {
  if (n.marketNote === "academy-pass" && n.passedAcademyName) {
    return `Passed ${n.passedAcademyName}`;
  }
  if (n.beatenNames && n.beatenNames.length > 0) {
    return `Over ${n.beatenNames.join(", ")}`;
  }
  if (n.marketNote === "open-fa") return "Open FA upgrade";
  if (n.marketNote === "rookie-gate") return "Rookie's door";
  return null;
}

function PlayerBlock({
  id,
  name,
  tier,
  lane,
  tone = "neutral",
}: {
  id?: string;
  name?: string;
  tier?: PlayerTier;
  lane: Lane;
  tone?: "out" | "in" | "neutral";
}) {
  const season = useDraftStore((s) => s.season);
  if (!name) return null;
  const live = findLivePlayerForCard(season, {
    ...(id ? { playerId: id } : {}),
    name,
    lane,
  });
  const playerId = id ?? live?.player.id;
  const nameCls =
    tone === "out"
      ? "text-rift-redbright/85"
      : tone === "in"
        ? "text-emerald-400/90"
        : "text-rift-mutedbright";
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {tier && <TierChip tier={tier} size="xs" />}
      <PlayerNameLink
        playerId={playerId}
        name={name}
        hint={
          live
            ? {
                player: live.player,
                ...(live.teamName ? { teamName: live.teamName } : {}),
                lane: live.player.lane ?? lane,
              }
            : playerId
              ? { lane }
              : {
                  player: {
                    name,
                    lane,
                    tier: tier ?? "C",
                    goodChamps: [],
                    badChamps: [],
                  },
                  lane,
                }
        }
        renderAs="span"
        className={`truncate max-w-[7rem] font-medium cursor-pointer ${nameCls}`}
      />
    </span>
  );
}

/** One league roster move — demote, debut, retire, FA, academy. */
export default function RosterNewsRow({
  item: n,
  team,
  highlight = false,
}: {
  item: RosterNewsItem;
  team?: {
    name: string;
    iconKey: string;
    logoUrl?: string;
    color: string;
  };
  highlight?: boolean;
}) {
  const kind = classifyRosterNews(n);
  const badge = KIND_BADGE[kind];
  const note = bidNote(n);
  const vacancyDemote =
    n.marketNote === "manual-demote" || n.marketNote === "ai-demote";
  const becameFa =
    n.marketNote === "academy-release" ||
    n.marketNote === "became-fa" ||
    n.marketNote === "academy-bump";
  const faToAcademy =
    n.marketNote === "fa-academy" ||
    n.marketNote === "academy-stash" ||
    n.marketNote === "academy-rookie";

  return (
    <div
      className={`grid grid-cols-[auto_1fr] sm:grid-cols-[auto_auto_1fr] gap-x-2 gap-y-1 px-2.5 py-2 min-h-[2.5rem] text-[10px] ${
        highlight ? "bg-rift-blue/[0.06]" : "hover:bg-rift-bg/20"
      }`}
    >
      {/* Meta column: time + team + lane */}
      <div className="flex items-center gap-1.5 shrink-0 col-span-2 sm:col-span-1">
        {n.timeMark && (
          <span
            className="px-1 py-px border border-rift-line/35 text-[7px] uppercase tracking-[0.14em] text-rift-muted/55 tabular-nums shrink-0"
            title="When this happened"
          >
            {n.timeMark}
          </span>
        )}
        <TeamLogoLink
          teamId={n.teamId}
          name={team?.name}
          iconKey={team?.iconKey ?? "shield"}
          logoUrl={team?.logoUrl}
          color={team?.color}
          size={14}
          renderAs="span"
        />
        <LaneIcon lane={n.lane} size="xs" className="shrink-0" />
        <span
          className={`hidden sm:inline px-1 py-px border text-[7px] uppercase tracking-[0.12em] shrink-0 ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Action + players */}
      <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 col-span-2 sm:col-span-1 sm:col-start-3">
        <span className={`sm:hidden px-1 py-px border text-[7px] uppercase tracking-[0.12em] shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>

        {kind === "retire" && (
          <>
            <PlayerBlock
              id={n.departedId ?? n.entrantId}
              name={n.departedName ?? n.entrantName}
              tier={n.departedTier ?? n.entrantTier}
              lane={n.lane}
              tone="out"
            />
            {n.departedAge != null && (
              <span className="text-[8px] text-rift-muted/50 tabular-nums">age {n.departedAge}</span>
            )}
          </>
        )}

        {becameFa && (
          <>
            <PlayerBlock
              id={n.departedId ?? n.entrantId}
              name={n.departedName ?? n.entrantName}
              tier={n.departedTier ?? n.entrantTier}
              lane={n.lane}
              tone="neutral"
            />
            <span className="text-[8px] text-rift-muted/55">
              {n.marketNote === "academy-release"
                ? "released"
                : n.marketNote === "academy-bump"
                  ? "academy full"
                  : "left org"}
            </span>
            {n.departedAge != null && (
              <span className="text-[8px] text-rift-muted/50 tabular-nums">· {n.departedAge}y</span>
            )}
          </>
        )}

        {faToAcademy && (
          <>
            <PlayerBlock
              id={n.entrantId}
              name={n.entrantName}
              tier={n.entrantTier}
              lane={n.lane}
              tone="in"
            />
            <span className="text-[8px] text-rift-muted/55">
              {n.marketNote === "academy-rookie"
                ? "rookie prospect"
                : n.marketNote === "academy-stash"
                  ? "AI stash"
                  : "from FA pool"}
            </span>
          </>
        )}

        {kind === "swap" && !vacancyDemote && (
          <>
            {n.departedName ? (
              <>
                <PlayerBlock
                  id={n.departedId}
                  name={n.departedName}
                  tier={n.departedTier}
                  lane={n.lane}
                  tone="out"
                />
                {n.departedAge != null && (
                  <span className="text-[8px] text-rift-muted/45 tabular-nums">{n.departedAge}y</span>
                )}
                <span className="text-rift-gold/50" aria-hidden>
                  →
                </span>
              </>
            ) : (
              <span className="text-[8px] uppercase tracking-[0.12em] text-rift-muted/50">Slot opened</span>
            )}
            <span
              className={`px-1 py-px border text-[7px] uppercase tracking-[0.1em] shrink-0 ${SOURCE_BADGE[n.entrantSource].cls}`}
            >
              {SOURCE_BADGE[n.entrantSource].label}
            </span>
            <PlayerBlock
              id={n.entrantId}
              name={n.entrantName}
              tier={n.entrantTier}
              lane={n.lane}
              tone="in"
            />
            {n.entrantPotential !== n.entrantTier && (
              <span className="inline-flex items-center gap-0.5 text-[8px] text-emerald-400/80">
                <span className="text-rift-muted/40">pot</span>
                <TierChip tier={n.entrantPotential} size="xs" />
              </span>
            )}
            {note && (
              <span className="text-[8px] text-rift-muted/45 truncate max-w-[12rem]" title={note}>
                · {note}
              </span>
            )}
          </>
        )}

        {vacancyDemote && (
          <>
            {n.departedName && (
              <>
                <PlayerBlock
                  id={n.departedId}
                  name={n.departedName}
                  tier={n.departedTier}
                  lane={n.lane}
                  tone="out"
                />
                {n.departedAge != null && (
                  <span className="text-[8px] text-rift-muted/45 tabular-nums">{n.departedAge}y</span>
                )}
              </>
            )}
            <span className="text-[8px] text-amber-300/75">
              {n.marketNote === "ai-demote" ? "AI bench · market fill pending" : "Benched · fill pending"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Count roster-news rows by visual category (for section headers). */
export function rosterNewsKindCounts(items: readonly RosterNewsEvent[]) {
  const counts = { retire: 0, freeAgent: 0, academy: 0, roster: 0, pending: 0 };
  for (const n of items) {
    const k = classifyRosterNews(n);
    if (k === "retire") counts.retire++;
    else if (k === "free-agent") counts.freeAgent++;
    else if (k === "academy-sign") counts.academy++;
    else if (k === "demote-pending") counts.pending++;
    else counts.roster++;
  }
  return counts;
}
