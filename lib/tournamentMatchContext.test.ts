import { describe, expect, it } from "vitest";
import { createTournament, recordMatchWinner, startSwissPlayoffs, startGroupsPlayoffs, startRoundRobinPlayoffs, stageFormatFor, formatHasPlayoffs, type TournamentFormat } from "./tournament";
import { TOURNAMENT_FORMATS } from "./importValidation";
import { tournamentMatchContext, matchContextLabels } from "./tournamentMatchContext";
const make = (format: TournamentFormat, count = 8) => createTournament({ name: "Context", format,
  teams: Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `Team ${i}`, seed: i + 1 })),
  defaults: { format: "bo1", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false },
});

describe("match context", () => {
  it.each(TOURNAMENT_FORMATS)("has stage/round labels throughout %s", format => {
    let t = make(format);
    let played = 0, sawPlayoffs = false;
    for (let i = 0; i < 500; i++) {
      const m = t.matches.find(row => !row.winner && row.blueTeamId && row.redTeamId);
      if (!m) {
        if (!formatHasPlayoffs(format)) break;
        const before = t.matches.length;
        t = stageFormatFor(format) === "swiss" ? startSwissPlayoffs(t) : stageFormatFor(format) === "groups" ? startGroupsPlayoffs(t) : startRoundRobinPlayoffs(t);
        if (before === t.matches.length) break;
        continue;
      }
      const context = tournamentMatchContext(t, m);
      expect(matchContextLabels(context).length).toBeGreaterThanOrEqual(2);
      expect(context.round).toBeGreaterThan(0);
      if (m.bracket) expect(context.stage).toMatch(/Playoffs|Knockout/);
      if (context.stage === "Playoffs") sawPlayoffs = true;
      const winner = m.bracket === "grand-final" ? m.redTeamId! : m.blueTeamId!;
      t = recordMatchWinner(t, m.id, { teamId: winner, blueWins: winner === m.blueTeamId ? 1 : 0, redWins: winner === m.redTeamId ? 1 : 0 });
      played++;
    }
    expect(played).toBeGreaterThan(0);
    if (formatHasPlayoffs(format)) expect(sawPlayoffs).toBe(true);
  });
  it.each([6, 8, 20, 32])("names knockout rounds with %s entrants and byes", count => {
    const t = make("single-elim", count);
    const first = t.matches.find(m => m.round === 1)!;
    expect(tournamentMatchContext(t, first).eliminationRound).toBe(count <= 8 ? "Quarterfinals" : "Round of 32");
    const final = t.matches.find(m => !m.feedsInto)!;
    expect(tournamentMatchContext(t, final).eliminationRound).toBe("Final");
  });
  it("uses Swiss records from BEFORE the round, including mismatched pairings", () => {
    let t = make("swiss");
    for (const m of t.matches) t = recordMatchWinner(t, m.id, { teamId: m.blueTeamId!, blueWins: 1, redWins: 0 });
    const m = t.matches.find(row => row.round === 2)!;
    const context = tournamentMatchContext(t, m);
    const after = recordMatchWinner(t, m.id, { teamId: m.blueTeamId!, blueWins: 1, redWins: 0 });
    expect(tournamentMatchContext(after, m).records).toEqual(context.records);
    const first = t.matches[0];
    expect(tournamentMatchContext(t, { ...m, blueTeamId: first.blueTeamId, redTeamId: first.redTeamId }).records).toEqual(["1-0", "0-1"]);
  });
  it("identifies play-ins independently of their names and marks byes", () => {
    const t = { ...make("swiss", 7), seasonSubStage: "play-in" as const, name: "Renamed qualifier" };
    const bye = t.matches.find(m => m.isBye)!;
    expect(matchContextLabels(tournamentMatchContext(t, bye))).toContain("Play-In");
    expect(matchContextLabels(tournamentMatchContext(t, bye))).toContain("Bye");
  });
  it("keeps group and domestic regular context", () => {
    const group = make("groups-playoffs", 10);
    expect(tournamentMatchContext(group, group.matches[0]).group).toBeTruthy();
    const split = { ...make("round-robin"), seasonStageKind: "split" as const };
    expect(matchContextLabels(tournamentMatchContext(split, split.matches[0]))).toEqual(["Regular Split", "Matchday 1"]);
  });
});
