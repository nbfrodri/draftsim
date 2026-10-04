import { makeAuditSeason } from "../auditFixtures";
import { applyTournamentUpdate } from "./engine";
import { expect, it } from "vitest";
import { currentOffseasonRosterNews, groupRosterNewsByTime, initializeOffseasonRosterNewsBoundary, rosterNewsForDigest } from "./rosterNews";
import { marketOrigin } from "./marketOrigin";
import type { SeasonState } from "./types";

it("keeps the previous offseason above every new split, and the closing offseason last", () => {
  const season = makeAuditSeason("Chronology");
  const old = marketOrigin(season, "Offseason");
  season.id = "next-year";
  season.franchise.year = 2;
  const news = { teamId: season.teams[0].id, lane: "top" as const, entrantName: "Player",
    entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "rookie" as const };
  season.rosterNews = ["Spring", "Offseason", "Winter", "Summer"].map(timeMark => ({
    ...news, timeMark, origin: timeMark === "Offseason" ? old : marketOrigin(season, timeMark),
  }));
  const groups = () => groupRosterNewsByTime(rosterNewsForDigest(season), season).map(([, group]) => group.timeMark);
  expect(groups()).toEqual(["Offseason", "Winter", "Spring", "Summer"]);
  expect(groupRosterNewsByTime(rosterNewsForDigest(season), season)[0][1].year).toBe(1);
  // Legacy carry also sorts first, without guessing its year.
  delete season.rosterNews[1].origin;
  expect(groups()[0]).toBe("Offseason");
  expect(groupRosterNewsByTime(rosterNewsForDigest(season), season)[0][1].year).toBeUndefined();
  season.status = "complete";
  season.offseasonRosterNewsBaseline = season.rosterNews.length;
  season.rosterNews.push({ ...news, timeMark: "Offseason", origin: marketOrigin(season, "Offseason") });
  expect(groups()).toEqual(["Winter", "Spring", "Summer", "Offseason"]);
});

it("keeps all carried offseason news visible during the next year without changing its ownership", () => {
  const season = makeAuditSeason("Live offseason");
  const origin = marketOrigin(season, "Offseason");
  season.id = "next-season";
  season.franchise.year = 2;
  season.rosterNews = (["retired", "became-fa", "academy-rookie", "fa-academy", "manual-demote", "fa-sign"] as const).map(note => ({
    teamId: season.teams[0].id, lane: "top", entrantName: note, entrantId: note,
    entrantTier: "A", entrantPotential: "A", entrantSource: "free-agent", marketNote: note,
    timeMark: "Offseason", origin,
  }));
  const saved = JSON.stringify(season);
  const reloaded: SeasonState = JSON.parse(saved);
  expect(rosterNewsForDigest(reloaded)).toEqual(season.rosterNews);
  expect(rosterNewsForDigest(reloaded).every(news => news.origin?.year === 1)).toBe(true);
  expect(currentOffseasonRosterNews(reloaded)).toEqual([]);
  expect(JSON.stringify(reloaded)).toBe(saved);
});

it("uses recorded windows and keeps only the new offseason once the current year finishes", () => {
  const season = makeAuditSeason("Digest origin");
  const oldOrigin = marketOrigin(season, "Offseason");
  season.id = "next-season";
  season.franchise.year = 2;
  season.status = "complete";
  const news = { teamId: season.teams[0].id, lane: "top" as const, entrantName: "Current offseason",
    entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "rookie" as const };
  season.rosterNews = [
    { ...news, entrantName: "Previous offseason", timeMark: "Winter", origin: oldOrigin },
    { ...news, entrantName: "Winter move", timeMark: "Offseason", origin: marketOrigin(season, "Winter") },
    { ...news, timeMark: "Summer", origin: marketOrigin(season, "Offseason") },
  ];
  // Provenance takes precedence over both legacy marks and the array boundary.
  season.offseasonRosterNewsBaseline = season.rosterNews.length;
  expect(rosterNewsForDigest(season).map(news => [news.entrantName, news.timeMark])).toEqual([
    ["Winter move", "Winter"], ["Current offseason", "Offseason"],
  ]);
  expect(season.rosterNews.map(news => news.timeMark)).toEqual(["Winter", "Offseason", "Summer"]);
});

it("shows legacy carry while playing without inventing a year and respects the closing boundary", () => {
  const season = makeAuditSeason("Legacy digest");
  season.franchise.year = 2;
  const row = { teamId: season.teams[0].id, lane: "top" as const, entrantName: "Old retirement",
    entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "free-agent" as const,
    marketNote: "retired" as const, timeMark: "Offseason" };
  season.rosterNews = [row, { ...row, entrantName: "Winter release", marketNote: "became-fa", timeMark: "Winter" }];
  expect(rosterNewsForDigest(season)).toEqual(season.rosterNews);
  expect(rosterNewsForDigest(season)[0].origin).toBeUndefined();
  season.status = "complete";
  season.offseasonRosterNewsBaseline = 2;
  season.rosterNews.push({ ...row, entrantName: "New retirement" });
  expect(rosterNewsForDigest(season).map(news => news.entrantName)).toEqual(["Winter release", "New retirement"]);
});

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
