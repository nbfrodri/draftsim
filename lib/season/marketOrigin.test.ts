import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { belongsToMarketWindow, marketOrigin, validMarketOrigin } from "./marketOrigin";
import { withRosterTimeMark } from "./playerLifecycle";
import { currentOffseasonRosterNews } from "./rosterNews";
import type { SeasonState } from "./types";
describe("market event ownership", () => {
  it("stamps new news and preserves it through later stamping attempts", () => {
    const season = makeAuditSeason();
    const [news] = withRosterTimeMark([{ timeMark: "Winter" }], "Winter", season);
    expect(news).toMatchObject({ origin: marketOrigin(season, "Winter") });
    const later = { ...season, id: "later", franchise: { ...season.franchise, year: 2 } };
    expect(withRosterTimeMark([news], "Offseason", later)[0].origin).toEqual(news.origin);
    expect(belongsToMarketWindow(news.origin!, later, "Winter")).toBe(false);
  });
  it("selects explicit current offseason even after reordering, without reclassifying old or Winter news", () => {
    const season: SeasonState = makeAuditSeason();
    season.franchise!.year = 2;
    const row = { teamId: season.teams[0].id, lane: "top" as const, entrantName: "Fixture", entrantTier: "A" as const, entrantPotential: "A" as const, entrantSource: "rookie" as const, timeMark: "Offseason" };
    const current = { ...row, origin: marketOrigin(season, "Offseason") };
    season.rosterNews = [current, { ...row, origin: { ...current.origin, year: 1 } }, { ...row, origin: marketOrigin(season, "Winter") }];
    season.offseasonRosterNewsBaseline = 3;
    expect(currentOffseasonRosterNews(season)).toEqual([current]);
    expect(currentOffseasonRosterNews(JSON.parse(JSON.stringify(season)))).toEqual([current]);
    const next = { ...season, id: "next", franchise: { ...season.franchise!, year: 3 } };
    expect(currentOffseasonRosterNews(next)).toEqual([]);
  });
  it("rejects malformed origins without guessing legacy ownership", () => {
    expect(validMarketOrigin({ seasonId: "s", year: 1, windowId: "other:Offseason" })).toBe(false);
    expect(validMarketOrigin({ seasonId: "s", year: 0, windowId: "s:Offseason" })).toBe(false);
    expect(validMarketOrigin(marketOrigin(makeAuditSeason(), "msi"))).toBe(true);
  });
});
