import { formatHasPlayoffs, playoffBracketKindFor, stageFormatFor, type TournamentMatch, type TournamentState } from "./tournament";

export interface TournamentMatchContext {
  stage: "Regular Split" | "Round Robin" | "Group Stage" | "Swiss Stage" | "Playoffs" | "Knockout";
  round: number;
  playIn?: boolean;
  group?: string;
  bracket?: string;
  eliminationRound?: string;
  records?: string[];
  bye?: boolean;
}

const BRACKETS = {
  winners: "Winners", losers: "Losers", elimination: "Last-Chance", consolation: "Consolation",
  "grand-final": "Grand Final", "grand-final-reset": "Grand Final Reset",
} as const;

/** Presentation only: never changes the simulator's round-depth/pressure calculation. */
export function tournamentMatchContext(t: TournamentState, m: TournamentMatch, playIn = t.seasonSubStage === "play-in"): TournamentMatchContext {
  const incoming = new Set(t.matches.flatMap(row => row.feedsInto ? [row.feedsInto.matchId] : []));
  const inBracket = !!m.bracket || !!m.feedsInto || incoming.has(m.id) ||
    ["single-elim", "double-elim", "triple-elim"].includes(t.format);
  const stageFormat = stageFormatFor(t.format) ?? t.format;
  const stage = inBracket ? (formatHasPlayoffs(t.format) || t.seasonStageKind === "split" ? "Playoffs" : "Knockout") :
    m.groupId ? "Group Stage" : stageFormat === "swiss" ? "Swiss Stage" :
    t.seasonStageKind === "split" ? "Regular Split" : "Round Robin";
  const context: TournamentMatchContext = { stage, round: m.round, ...(playIn ? { playIn: true } : {}), ...(m.isBye ? { bye: true } : {}) };
  if (m.groupId) context.group = m.groupId;
  if (inBracket) {
    if (m.bracket) context.bracket = BRACKETS[m.bracket];
    if (t.format === "round-robin-playoffs-step") {
      context.bracket = "Stepladder";
      if (!m.feedsInto) context.eliminationRound = "Final";
    } else if (!m.bracket || (formatHasPlayoffs(t.format) && playoffBracketKindFor(t.format) === "single-elim" && m.bracket === "winners")) {
      // Follow advancement edges: robust to a stage offset and first-round byes.
      const byId = new Map(t.matches.map(row => [row.id, row]));
      const seen = new Set<string>([m.id]);
      let next = m.feedsInto, remaining = 0;
      while (next && !seen.has(next.matchId)) {
        const target = byId.get(next.matchId);
        if (!target) break;
        seen.add(target.id); remaining++; next = target.feedsInto;
      }
      context.eliminationRound = remaining === 0 ? "Final" : remaining === 1 ? "Semifinals" :
        remaining === 2 ? "Quarterfinals" : `Round of ${2 ** (remaining + 1)}`;
    }
  } else if (stage === "Swiss Stage") {
    const records = new Map<string, { wins: number; losses: number }>();
    for (const row of t.matches) {
      if (row.round >= m.round || !row.winner || row.bracket || row.feedsInto || incoming.has(row.id)) continue;
      for (const id of [row.blueTeamId, row.redTeamId]) {
        if (!id) continue;
        const record = records.get(id) ?? { wins: 0, losses: 0 };
        if (row.winner.teamId === id) record.wins++; else record.losses++;
        records.set(id, record);
      }
    }
    context.records = [m.blueTeamId, m.redTeamId].filter((id): id is string => !!id).map(id => {
      const record = records.get(id);
      return `${record?.wins ?? 0}-${record?.losses ?? 0}`;
    });
  }
  return context;
}

export function matchContextLabels(context: TournamentMatchContext): string[] {
  const labels = [context.stage as string];
  if (context.playIn) labels.unshift("Play-In");
  if (context.group) labels.push(`Group ${context.group}`);
  if (context.bracket) labels.push(context.bracket);
  if (context.eliminationRound) labels.push(context.eliminationRound);
  labels.push(`${["Regular Split", "Round Robin", "Group Stage"].includes(context.stage) ? "Matchday" : "Round"} ${context.round}`);
  if (context.records?.length) labels.push(context.records.every(r => r === context.records![0]) ? context.records[0] : context.records.join(" vs "));
  if (context.bye) labels.push("Bye");
  return labels;
}
