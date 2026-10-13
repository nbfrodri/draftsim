import {
  clampDEAdvancing, computeGroupStandings, computeStandings, playoffBracketKindFor,
  type TeamStanding, type TournamentMatch, type TournamentState,
} from "../tournament";

/** Add the teams of one standings pool that can no longer miss its top `slots`. */
function clinchPool(matches: TournamentMatch[], standings: TeamStanding[], slots: number, out: Set<string>) {
  if (matches.length === 0 || slots <= 0) return;
  const left = new Map<string, number>();
  for (const m of matches) {
    if (m.winner) continue;
    for (const id of [m.blueTeamId, m.redTeamId]) if (id) left.set(id, (left.get(id) ?? 0) + 1);
  }
  // Stage over: the tiebreakers are final, so the standings order is the answer.
  if (left.size === 0) {
    for (const s of standings.slice(0, slots)) out.add(s.team.id);
    return;
  }
  // Mid-stage: a tie on match wins counts against the team, so no unresolved
  // tiebreaker (game diff, head-to-head) can ever take the badge back.
  for (const s of standings) {
    const rivals = standings.filter(o => o !== s && o.wins + (left.get(o.team.id) ?? 0) >= s.wins).length;
    if (rivals < slots) out.add(s.team.id);
  }
}

/** Teams certain to reach the playoff bracket from a round-robin or group regular stage.
 * ponytail: Swiss stages are skipped (pairings are dynamic; their standings table
 * already marks the win target). Add a Swiss branch here if those need badges. */
export function playoffClinchedIds(t: TournamentState): Set<string> {
  const out = new Set<string>();
  const de = playoffBracketKindFor(t.format) === "double-elim";
  const regular = t.matches.filter(m => m.bracket === undefined && !m.isBye);
  if (t.rrPlayoffsAdvancing != null) {
    // Mirrors startRoundRobinPlayoffs: DE brackets snap down to a supported size.
    let slots = Math.min(t.rrPlayoffsAdvancing, t.teams.length);
    if (de) slots = slots < 4 ? 0 : clampDEAdvancing(slots);
    clinchPool(regular, computeStandings(t), slots, out);
  } else if (t.groupsPlayoffs) {
    const { groupCount, advancingPerGroup } = t.groupsPlayoffs;
    // startGroupsPlayoffs trims an unsupported DE field from the bottom; when
    // that can happen a top-K group finish is not a guaranteed berth.
    const field = (t.groupsByeTeamIds?.length ?? 0) + groupCount * advancingPerGroup;
    if (de && (field < 4 || clampDEAdvancing(field) !== field)) return out;
    for (const groupId of new Set(regular.map(m => m.groupId))) {
      if (!groupId) continue;
      clinchPool(regular.filter(m => m.groupId === groupId), computeGroupStandings(t, groupId), advancingPerGroup, out);
    }
  }
  return out;
}
