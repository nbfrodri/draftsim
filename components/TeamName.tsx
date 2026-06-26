"use client";

import { logoForTeamName } from "@/lib/season/realTeams";
import TeamIcon from "./TeamIcon";

// Inline team logo + name. Resolves the real-team logo from the team name
// (a pure lookup over the bundled snapshot); generated teams have no match,
// so only the name renders. Drop in wherever a team name is shown so the
// series simulator / live view picks up real-team branding without threading
// logo props through the whole component tree.
// ponytail: name-only lookup; if generated teams ever need their iconKey/color
// here too, thread the full team object instead.
export default function TeamName({
  name,
  size = 16,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const logoUrl = logoForTeamName(name);
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
