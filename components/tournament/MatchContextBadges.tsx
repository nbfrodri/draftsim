import type { ReactNode } from "react";
import { matchContextLabels, type TournamentMatchContext } from "@/lib/tournamentMatchContext";

export default function MatchContextBadges({ context, stage, group, children }: { context?: TournamentMatchContext; stage?: string; group?: string; children?: ReactNode }) {
  const legacy: Record<string, string> = { regular: "Regular Split", group: "Group Stage", winners: "Winners", losers: "Losers", elimination: "Last-Chance", consolation: "Consolation", "grand-final": "Grand Final", "grand-final-reset": "Grand Final Reset", stepladder: "Stepladder" };
  const labels = context ? matchContextLabels(context) : [legacy[stage ?? ""] ?? "Match", ...(group ? [`Group ${group}`] : [])];
  return <span className="flex w-full flex-wrap items-center justify-center gap-1" aria-label="Match context">
    {labels.map(label => <span key={label} className="px-1.5 py-0.5 border border-rift-gold/30 text-rift-goldbright/85 text-[8px] uppercase tracking-[0.1em]">{label}</span>)}
    {children}
  </span>;
}
