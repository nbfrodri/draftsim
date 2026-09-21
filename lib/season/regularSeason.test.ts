import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { createTournament, recordMatchWinner, startRoundRobinPlayoffs, type TournamentFormat } from "../tournament";
import { nextSplitRegularMatch } from "./regularSeason";

describe("split regular-season boundary", () => {
  it.each(["round-robin-playoffs", "groups-playoffs", "swiss-playoffs", "round-robin"] as TournamentFormat[])("selects regular matches in %s", format => {
    const season = makeAuditSeason();
    const original = season.tournaments[season.phases[0].tournamentIds[0]];
    const t = createTournament({ name: "Regular", format, teams: original.teams, defaults: original.defaults, playoffTeams: 4 });
    season.tournaments = { [t.id]: t };
    season.phases[0].tournamentIds = [t.id];
    expect(nextSplitRegularMatch(season)?.match.bracket).toBeUndefined();
    expect(nextSplitRegularMatch(season)?.tournament.id).toBe(t.id);
  });
  it("skips a region ready for playoffs and continues the next region", () => {
    const season = makeAuditSeason();
    const [first, second] = season.phases[0].tournamentIds;
    let t = season.tournaments[first];
    for (const match of t.matches) {
      if (!match.winner && match.blueTeamId && match.redTeamId)
        t = recordMatchWinner(t, match.id, { teamId: match.blueTeamId, blueWins: 1, redWins: 0 });
    }
    season.tournaments[first] = t;
    expect(nextSplitRegularMatch(season)?.tournament.id).toBe(second);
    season.tournaments[first] = startRoundRobinPlayoffs(t);
    expect(nextSplitRegularMatch(season)?.tournament.id).toBe(second);
    season.phases[0].tournamentIds = [first];
    expect(nextSplitRegularMatch(season)).toBeNull();
  });
  it("rejects international, transfer, completed seasons and elimination-only splits", () => {
    const season = makeAuditSeason();
    season.phases[0].kind = "international";
    expect(nextSplitRegularMatch(season)).toBeNull();
    season.phases[0].kind = "transfer";
    expect(nextSplitRegularMatch(season)).toBeNull();
    season.phases[0].kind = "split";
    season.status = "complete";
    expect(nextSplitRegularMatch(season)).toBeNull();
    season.status = "in-progress";
    for (const t of Object.values(season.tournaments)) t.format = "single-elim";
    expect(nextSplitRegularMatch(season)).toBeNull();
  });
});
