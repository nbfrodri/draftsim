import { describe, expect, it } from "vitest";

import type { SeasonState, SeasonTeam } from "@/lib/season/types";
import { resolveLive } from "@/components/team/TeamCardContext";

function team(id: string): SeasonTeam {
  return { id, name: `Team ${id}`, leagueId: "LCK", color: "#fff", iconKey: "shield", players: [], personalityId: "" };
}

describe("live match hover context", () => {
  it("keeps the opponent and result current for the same snapshot roster", () => {
    const teams = [team("A"), team("B"), team("C")];
    const matches = [
      { id: "ab", round: 1, blueTeamId: "A", redTeamId: "B", winner: { teamId: "A", blueWins: 2, redWins: 0 }, isBye: false },
      { id: "ac", round: 2, blueTeamId: "A", redTeamId: "C", winner: { teamId: "C", blueWins: 0, redWins: 2 }, isBye: false },
    ];
    const season = {
      id: "one-season", teams, phases: [], splitResults: {}, intlResults: {},
      tournaments: { event: { id: "event", matches } },
    } as unknown as SeasonState;
    const idx = {
      season, teamsById: new Map(teams.map(t => [t.id, t])),
      academyByTeam: new Map<string, number>(), hallEntries: [],
      hallKeys: () => new Set<string>(),
    };
    const snapshot = { players: teams[0].players };
    const versusB = () => resolveLive(idx, "A", { hint: snapshot, opponentTeamId: "B" });
    const versusC = () => resolveLive(idx, "A", { hint: snapshot, opponentTeamId: "C" });

    expect(versusB()?.h2h).toMatchObject({ opponentName: "Team B", overall: { wins: 1, losses: 0 } });
    expect(versusC()?.h2h).toMatchObject({ opponentName: "Team C", overall: { wins: 0, losses: 1 } });
    expect(resolveLive(idx, "A", { hint: snapshot })?.h2h).toBeUndefined();

    matches.push({ id: "ab2", round: 3, blueTeamId: "A", redTeamId: "B", winner: { teamId: "B", blueWins: 0, redWins: 2 }, isBye: false });
    expect(versusB()?.h2h).toMatchObject({ opponentName: "Team B", overall: { wins: 1, losses: 1 } });
  });
});
