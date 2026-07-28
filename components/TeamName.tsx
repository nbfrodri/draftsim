"use client";

import { useDraftStore } from "@/store/draftStore";
import { logoForTeamName } from "@/lib/season/realTeams";
import TeamIcon from "./TeamIcon";
import TeamNameLink from "./team/TeamNameLink";

// Inline team logo + name. In live season mode, resolves the season team by
// name and wraps with TeamNameLink so hover cards (series + titles) work
// wherever TeamName is used (between-games, draft header, etc.). Outside a
// season, falls back to a name-only real-team logo lookup.
export default function TeamName({
  name,
  size = 16,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const season = useDraftStore((s) => s.season);
  const team = season?.teams.find((t) => t.name === name);
  const logoUrl = team?.logoUrl ?? logoForTeamName(name) ?? undefined;

  if (team) {
    return (
      <TeamNameLink
        teamId={team.id}
        name={team.name}
        leagueId={team.leagueId}
        iconKey={team.iconKey}
        logoUrl={logoUrl}
        color={team.color}
        logoSize={size}
        hint={{ team }}
        renderAs="span"
        className={`inline-flex items-center gap-1.5 min-w-0 ${className}`}
      />
    );
  }

  return (
    <>
      {logoUrl && (
        <TeamIcon
          logoUrl={logoUrl}
          size={size}
          className={`inline-block align-middle mr-1.5 ${className}`}
        />
      )}
      {name}
    </>
  );
}
