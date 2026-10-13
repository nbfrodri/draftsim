import { describe, expect, it } from "vitest";
import { computeStandings, createTournament, recordMatchWinner, type TournamentState } from "../tournament";
import { playoffClinchedIds } from "./playoffClinch";

function league(count: number, advancing: number) {
  return createTournament({
    name: "Split", format: "round-robin-playoffs-step",
    teams: Array.from({ length: count }, (_, i) => ({ id: `t${i + 1}`, name: `Team ${i + 1}`, seed: i + 1 })),
    defaults: { format: "bo1", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false },
    rrPlayoffsAdvancingOverride: advancing,
  });
}

/** Play the next open regular match; the lower team number always wins. */
function playNext(t: TournamentState) {
  const m = t.matches.find(m => !m.winner && m.bracket === undefined)!;
  const blueWins = Number(m.blueTeamId!.slice(1)) < Number(m.redTeamId!.slice(1));
  return recordMatchWinner(t, m.id, { teamId: blueWins ? m.blueTeamId! : m.redTeamId!, blueWins: blueWins ? 1 : 0, redWins: blueWins ? 0 : 1 });
}

describe("playoff clinches during a regular stage", () => {
  it("never revokes a berth and ends on exactly the standings top N", () => {
    let t = league(6, 4);
    expect(playoffClinchedIds(t).size).toBe(0);
    let previous = new Set<string>();
    let sawEarlyClinch = false;
    while (t.matches.some(m => !m.winner && m.bracket === undefined)) {
      const open = t.matches.filter(m => !m.winner && m.bracket === undefined).length;
      t = playNext(t);
      const now = playoffClinchedIds(t);
      for (const id of previous) expect(now.has(id)).toBe(true);
      if (open > 1 && now.size > 0) sawEarlyClinch = true;
      previous = now;
    }
    expect(sawEarlyClinch).toBe(true);
    expect([...previous].sort()).toEqual(computeStandings(t).slice(0, 4).map(s => s.team.id).sort());
  });

  it("does not clinch on a tie that tiebreakers could still flip", () => {
    // 4 teams, top 2: after one round two teams are 1-0 and two are 0-1 with
    // two games left each, so nobody is safe yet.
    let t = league(4, 2);
    t = playNext(playNext(t));
    expect(playoffClinchedIds(t).size).toBe(0);
  });
});
