"use client";
import {
type SeasonHistoryTeamRef
} from "@/lib/season/history";
import {
type DynastyTier
} from "@/lib/season/historyRecords";
import {
refFor
} from "@/lib/season/historySearch";
import {
ACADEMY_YEARS,
ACADEMY_YEARS_MAX,
FREE_AGENT_YEARS
} from "@/lib/season/playerLifecycle";
import { resolveTeamLogo } from "@/lib/season/realTeams";
import {
type LeagueId, type SplitId, type InternationalId
} from "@/lib/season/types";
import type { Lane } from "@/lib/types";
import {
createContext,
memo,
useContext
} from "react";
import LeagueIcon from "../LeagueIcon";
import PlayerNameLink from "../player/PlayerNameLink";
import TeamLogoLink from "../team/TeamLogoLink";
import TeamNameLink from "../team/TeamNameLink";

export type CareerStatus = "active" | "academy" | "free-agent" | "retired";

export const acyBadgeYears = (inactiveYears: number) =>
  Math.min(ACADEMY_YEARS_MAX, Math.max(1, inactiveYears));

export function CareerStatusBadge({
  status,
  academyYears,
  freeAgentYears,
  inactiveYears,
  retired,
  size = "sm",
}: {
  status?: CareerStatus;
  academyYears?: number;
  freeAgentYears?: number;
  inactiveYears?: number;
  retired?: boolean;
  size?: "sm" | "md";
}) {
  const resolved: CareerStatus =
    status ?? (retired ? "retired" : "active");
  if (resolved === "active") return null;
  const cls =
    size === "md"
      ? "text-[9px] uppercase tracking-[0.2em] border px-1.5 py-0.5"
      : "text-[7px] uppercase tracking-[0.15em] border px-1 shrink-0";
  if (resolved === "academy") {
    const y =
      academyYears ?? (inactiveYears != null ? acyBadgeYears(inactiveYears) : undefined);
    return (
      <span
        className={`${cls} text-amber-400/85 border-amber-500/40 bg-amber-500/10`}
        title={y != null ? `Academy · ${y}y` : "Academy"}
      >
        {size === "md" ? "Academy" : "Acy"}
        {y != null ? (size === "md" ? ` · ${y}y` : ` ${y}y`) : ""}
      </span>
    );
  }
  if (resolved === "free-agent") {
    const y =
      freeAgentYears ??
      (inactiveYears != null
        ? Math.min(
            FREE_AGENT_YEARS,
            Math.max(1, inactiveYears - ACADEMY_YEARS),
          )
        : undefined);
    return (
      <span
        className={`${cls} text-sky-400/85 border-sky-500/40 bg-sky-500/10`}
        title={y != null ? `Free agent · ${y}y inactive` : "Free agent (inactive)"}
      >
        {size === "md" ? "Inactive" : "FA"}
        {y != null ? (size === "md" ? ` · ${y}y` : ` ${y}y`) : ""}
      </span>
    );
  }
  return (
    <span
      className={`${cls} text-rift-redbright/80 border-rift-red/40 bg-rift-red/10`}
      title="Retired"
    >
      {size === "md" ? "Retired" : "Ret"}
    </span>
  );
}

export type NavFn = (kind: "players" | "teams" | "coaches", id: string) => void;

export const PlayerTeamIcon = memo(function PlayerTeamIcon({
  teamName,
  leagueId,
  identity,
  size = 13,
  onNavigate: _onNavigate,
  nested = false,
}: {
  teamName?: string;
  leagueId?: LeagueId | null;
  identity: Map<string, SeasonHistoryTeamRef>;
  size?: number;
  onNavigate?: NavFn;
  /** When true, renders as span — safe inside picker-row buttons. */
  nested?: boolean;
}) {
  const seasonId = useContext(SeasonScope);
  if (!teamName || !leagueId) return null;
  const ref = refFor(identity, teamName, leagueId);
  return (
    <TeamLogoLink
      seasonId={seasonId}
      name={ref.name}
      leagueId={ref.leagueId}
      iconKey={ref.iconKey}
      logoUrl={resolveTeamLogo(ref.name, ref.logoUrl)}
      color={ref.color}
      size={size}
      renderAs={nested ? "span" : "button"}
      hint={{ name: ref.name, leagueId: ref.leagueId, iconKey: ref.iconKey, logoUrl: ref.logoUrl, color: ref.color }}
    />
  );
});

export const SeasonScope = createContext<string | undefined>(undefined);

export const NavPlayerName = memo(function NavPlayerName({
  name,
  playerId,
  onNavigate: _onNavigate,
  className = "",
  nested = false,
  hint,
  phaseScope,
}: {
  phaseScope?: SplitId | InternationalId;
  name: string;
  playerId?: string;
  onNavigate?: NavFn;
  className?: string;
  /** When true, renders as span — safe inside expand-row buttons. */
  nested?: boolean;
  /** Year-row team / lane the resolver can't derive without a phase snapshot. */
  hint?: { teamName?: string; lane?: Lane };
}) {
  const seasonId = useContext(SeasonScope);
  if (!playerId) {
    return <span className={className}>{name}</span>;
  }
  return (
    <PlayerNameLink
      playerId={playerId}
      name={name}
      seasonId={seasonId}
      phaseScope={phaseScope}
      hint={hint}
      className={className}
      renderAs={nested ? "span" : "button"}
    />
  );
});

export const LANES: readonly { lane: Lane; label: string }[] = [
  { lane: "top", label: "Top" },
  { lane: "jungle", label: "Jungle" },
  { lane: "middle", label: "Mid" },
  { lane: "bottom", label: "Bot" },
  { lane: "support", label: "Support" },
];

export const TeamRef = memo(function TeamRef({
  team,
  size = 13,
  muted = false,
  showRegion = true,
  onNavigate: _onNavigate,
  nested = false,
  seasonId: seasonIdProp,
  phaseScope,
  marketSnapshot,
}: {
  marketSnapshot?: import("@/lib/season/marketSnapshots").MarketTeamSnapshot | null;
  team: SeasonHistoryTeamRef;
  size?: number;
  muted?: boolean;
  showRegion?: boolean;
  onNavigate?: NavFn;
  /** When true, renders as span — safe inside outer nav buttons. */
  nested?: boolean;
  /**
   * Pin the hover card to this archived year. When omitted, uses SeasonScope
   * if present; otherwise career / latest-roster resolution.
   */
  seasonId?: string;
  phaseScope?: SplitId | InternationalId;
}) {
  const scopeSeasonId = useContext(SeasonScope);
  const seasonId = seasonIdProp ?? scopeSeasonId;
  const logoUrl = resolveTeamLogo(team.name, team.logoUrl);
  return (
    <TeamNameLink
      name={team.name}
      leagueId={team.leagueId}
      seasonId={seasonId}
      phaseScope={phaseScope}
      iconKey={team.iconKey}
      logoUrl={logoUrl}
      color={team.color}
      showLogo
      logoSize={size}
      noNavigate={nested}
      renderAs={nested ? "span" : "button"}
      className={`inline-flex items-center gap-1.5 min-w-0 max-w-full overflow-hidden ${
        muted ? "text-rift-mutedbright" : "text-rift-goldbright"
      }`}
      hint={{
        ...(marketSnapshot !== undefined ? { marketSnapshot } : {}),
        name: team.name,
        leagueId: team.leagueId,
        iconKey: team.iconKey,
        logoUrl: team.logoUrl,
        color: team.color,
      }}
    >
      <span className={`min-w-0 truncate ${muted ? "text-rift-mutedbright" : "text-rift-goldbright"}`}>
        {team.name}
      </span>
      {showRegion && <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] text-rift-muted/70 flex-shrink-0">
        <LeagueIcon league={team.leagueId} size={12} />
        {team.leagueId}
      </span>}
    </TeamNameLink>
  );
});

export function DynastyBadge({ tier }: { tier: DynastyTier }) {
  if (tier === "none") return null;
  const legendary = tier === "legendary";
  return (
    <span
      className={`px-1.5 py-px border text-[8px] uppercase tracking-[0.25em] flex-shrink-0 ${
        legendary
          ? "border-rift-goldbright bg-rift-goldbright/15 text-rift-goldbright"
          : "border-rift-gold/70 bg-rift-gold/10 text-rift-goldbright"
      }`}
    >
      {legendary ? "Legendary Dynasty" : "Dynasty"}
    </span>
  );
}
