import { makeAuditSeason } from "../auditFixtures";
import { applyTournamentUpdate } from "./engine";
import { expect, it } from "vitest";
import { currentOffseasonRosterNews, initializeOffseasonRosterNewsBoundary } from "./rosterNews";
import type { SeasonState } from "./types";
it("keeps previous offseason carry and Winter changes out of the current offseason", () => {
  const season = { offseasonRosterNewsBaseline: 2, rosterNews: [
    { entrantName: "Old carry", timeMark: "Offseason" },
    { entrantName: "Winter rookie", timeMark: "Winter" },
    { entrantName: "New offseason rookie", timeMark: "Offseason" },
    { entrantName: "Unknown legacy timing" },
  ] } as SeasonState;
  const reloaded = JSON.parse(JSON.stringify(season));
  expect(currentOffseasonRosterNews(reloaded).map(n => n.entrantName)).toEqual(["New offseason rookie"]);
  expect(season.rosterNews).toHaveLength(4);
});
it("recognizes a zero baseline and preserves legacy stamps", () => {
  const season = { offseasonRosterNewsBaseline: 0, rosterNews: [{ timeMark: "Winter" }, { timeMark: "Offseason" }] } as SeasonState;
  expect(currentOffseasonRosterNews(season)).toHaveLength(1);
});

it("preserves uncertain legacy rows but only attributes new additions to current offseason", () => {
  const old = { status: "complete", rosterNews: [{ timeMark: "Offseason", entrantName: "Unknown year" }, { timeMark: "Winter", entrantName: "Winter rookie" }] } as SeasonState;
  expect(currentOffseasonRosterNews(old)).toEqual([]);
  const initialized = initializeOffseasonRosterNewsBoundary(old);
  expect(initialized.rosterNews).toBe(old.rosterNews);
  const newRow = { ...old.rosterNews![0], entrantName: "New signing" };
  const reloaded = JSON.parse(JSON.stringify({ ...initialized, rosterNews: [...initialized.rosterNews!, newRow] }));
  expect(currentOffseasonRosterNews(reloaded)).toEqual([newRow]);
  expect(old.offseasonRosterNewsBaseline).toBeUndefined();
});

for (const event of ["worlds", "global-cup"] as const) {
  for (const priorCount of [0, 2]) {
    it(`freezes the news boundary once when ${event} ends (${priorCount} earlier rows)`, () => {
      const season: SeasonState = makeAuditSeason("Boundary");
      const tournament = Object.values(season.tournaments)[0];
      season.phases = [{ kind: "international", event, label: event, tournamentIds: [tournament.id], status: "in-progress" }];
      season.phaseIndex = 0;
      season.rosterNews = Array.from({ length: priorCount }, (_, i) => ({ teamId: season.teams[0].id,
        lane: "top", timeMark: i === 0 ? "Offseason" : "Winter", entrantName: `Earlier ${i}`,
        entrantTier: "A", entrantPotential: "A", entrantSource: "rookie" }));
      const done = { ...tournament, status: "complete" as const };
      const completed = applyTournamentUpdate(season, done, []);
      expect(completed.status).toBe("complete");
      expect(completed.offseasonRosterNewsBaseline).toBe(priorCount);
      expect(currentOffseasonRosterNews(completed)).toEqual([]);
      const row = { teamId: season.teams[0].id, lane: "top" as const, timeMark: "Offseason",
        entrantName: "Actual offseason", entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "rookie" as const };
      const updated = { ...completed, rosterNews: [...completed.rosterNews!, row] };
      const repeated = applyTournamentUpdate(updated, done, []);
      expect(currentOffseasonRosterNews(repeated)).toEqual([row]);
      expect(repeated.offseasonRosterNewsBaseline).toBe(priorCount);
    });
  }
}
