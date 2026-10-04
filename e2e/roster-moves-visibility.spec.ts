import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { TOTAL_INACTIVE_BEFORE_RETIRE } from "../lib/season/playerLifecycle";
import type { SimRosterMovesEntry } from "../lib/season/simResultsSummary";
import type { SeasonState } from "../lib/season/types";

const screenshots = "test-results/roster-moves-review";
// Keep the fixed save-status overlay out of cropped review images.
const screenshotStyle = '[aria-label="Save status"] { visibility: hidden !important; }';

async function seedOnce(page: Page, state: unknown) {
  await page.addInitScript(state => {
    if (!localStorage.getItem("draftsim-store")) {
      localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state }));
    }
  }, state);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
}

test("year-end retirements stay visible after a real rollover and reload, and match the Hall", async ({ page }) => {
  const season: SeasonState = makeAuditSeason("Retirement review");
  const franchise = season.franchise!;
  season.status = "complete";
  franchise.year = 8;
  season.config.playerTransfers = true;
  season.offseasonRosterNewsBaseline = 0;
  season.worldsOffseasonBaseline = 0;
  const retirees = ["Northwind", "SilverRiver", "VeteranTop"];
  franchise.inactivePool = retirees.map((name, index) => ({
    player: { ...season.teams[index].players[index], id: `retiring-${index}`, name, age: 30 + index },
    status: "free-agent", inactiveYears: TOTAL_INACTIVE_BEFORE_RETIRE,
    inactiveTenure: { academyYears: 3, freeAgentYears: 3 },
    demotedYear: 1, clockYear: 4, lastTeamId: season.teams[index].id, lastTeamName: season.teams[index].name,
  }));
  await seedOnce(page, {
    season, seasonViewOpen: true, activeRealityId: franchise.id,
    realities: [{ id: franchise.id, name: franchise.name, year: 8, season, history: [] }],
  });
  await page.getByRole("button", { name: /Finalize Offseason.*Year 9/ }).click();
  const digest = page.getByRole("button", { name: /^Transfer Window/ }).locator("..");
  await expect(digest.getByRole("button", { name: /Offseason · Year 8/ })).toBeVisible();
  for (const name of retirees) await expect(digest.getByText(name, { exact: true })).toBeVisible();
  await digest.screenshot({ path: `${screenshots}/offseason-all-moves.png`, style: screenshotStyle });
  await digest.getByRole("tab", { name: /^Retired\s*3$/ }).click();
  for (const name of retirees) await expect(digest.getByText(name, { exact: true })).toBeVisible();
  await digest.getByRole("button", { name: /^Post Worlds.*Year 8/ }).click();
  await digest.screenshot({ path: `${screenshots}/offseason-retirements.png`, style: screenshotStyle });

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to reality", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state);
  const retiredNews = saved.season.rosterNews.filter((news: { marketNote?: string }) => news.marketNote === "retired");
  expect(retiredNews.map((news: { entrantName: string }) => news.entrantName).sort()).toEqual([...retirees].sort());
  expect(retiredNews.every((news: { origin: { year: number; seasonId: string } }) => news.origin.year === 8 && news.origin.seasonId === season.id)).toBe(true);
  const archivedNews = saved.realities[0].history[0].marketNews.filter((news: { marketNote?: string }) => news.marketNote === "retired");
  expect(archivedNews.map((news: { entrantId: string }) => news.entrantId).sort()).toEqual(retiredNews.map((news: { entrantId: string }) => news.entrantId).sort());

  await page.reload();
  await digest.getByRole("tab", { name: /^Retired\s*3$/ }).click();
  await expect(digest.getByRole("button", { name: /Offseason · Year 8/ })).toBeVisible();
  for (const name of retirees) await expect(digest.getByText(name, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 700 });
  await digest.getByRole("button", { name: /^Roster moves/ }).locator("..").screenshot({
    path: `${screenshots}/offseason-retirements-reloaded-1024.png`, style: screenshotStyle,
  });

  await page.getByRole("button", { name: "Main Menu", exact: true }).click();
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "Roster Moves", exact: true }).click();
  const hall = page.getByRole("region", { name: "Roster moves history" });
  await hall.getByRole("combobox", { name: "Movement types", exact: true }).click();
  await hall.getByRole("option", { name: "Retirement", exact: true }).click();
  await expect(hall.getByTestId("market-move")).toHaveCount(3);
  for (const name of retirees) await expect(hall.getByText(name, { exact: true })).toBeVisible();
  await hall.screenshot({ path: `${screenshots}/hall-same-retirements.png`, style: screenshotStyle });
});

test("live roster-move names remain legible at desktop minimum width and in compact mode", async ({ page }) => {
  const season = makeAuditSeason("Live results review");
  const [fromTeam, toTeam] = season.teams;
  const base = { fromTeam, toTeam, lane: "top" as const, swapTier: "A" as const, starTier: "S" as const };
  const entry: SimRosterMovesEntry = {
    kind: "roster-moves", seasonId: season.id, year: 1, label: "Post Worlds", afterEvent: "worlds",
    moves: [
      { ...base, swapName: "BrokenBlade", swapId: "move-out", starName: "Thunderstriker", starId: "move-in" },
      { ...base, kind: "retire", swapName: "SilverRiver", swapId: "retired", toTeam: fromTeam },
      { ...base, kind: "callup", starName: "NorthernLights", starId: "academy", toTeam: fromTeam },
      { ...base, kind: "fa-sign", starName: "Dreamcatcher", starId: "fa", toTeam: fromTeam },
      { ...base, kind: "release", swapName: "MoonlightShadow", swapId: "release", toTeam: fromTeam },
      { ...base, kind: "demotion", swapName: "VeteranTop", swapId: "demote", toTeam: fromTeam },
    ],
  };
  await seedOnce(page, { season, seasonViewOpen: true, simResultsFeed: [entry] });
  const feed = page.locator("#sim-results-panel");
  await feed.getByRole("button", { name: "Show all 6 moves", exact: true }).click();
  const names = entry.moves.flatMap(move => [move.swapName, move.starName].filter((name): name is string => !!name));
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: width === 1024 ? 700 : 900 });
    for (const name of names) {
      const label = feed.getByText(name, { exact: true });
      await expect(label).toBeVisible();
      const metrics = await label.evaluate(element => {
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
          size: parseFloat(style.fontSize), weight: Number(style.fontWeight),
          textWidth: range.getBoundingClientRect().width, visibleWidth: element.getBoundingClientRect().width,
        };
      });
      expect(metrics.size).toBeGreaterThanOrEqual(12);
      expect(metrics.weight).toBeGreaterThanOrEqual(600);
      expect(metrics.textWidth).toBeLessThanOrEqual(metrics.visibleWidth + 1);
    }
    await expect(feed.getByText("Retired", { exact: true })).toBeVisible();
    expect(await feed.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await feed.screenshot({ path: `${screenshots}/live-results-names-${width}.png`, style: screenshotStyle });
  }
  await feed.getByRole("button", { name: "Compact", exact: true }).click();
  await expect(feed.getByText("SilverRiver", { exact: true })).toBeVisible();
  await feed.screenshot({ path: `${screenshots}/live-results-names-compact-1024.png`, style: screenshotStyle });
  await feed.getByRole("button", { name: "Show less", exact: true }).click();
  await expect(feed.getByText("VeteranTop", { exact: true })).toHaveCount(0);
  await feed.getByRole("button", { name: "Roster moves", exact: true }).click();
  await expect(feed.getByText("SilverRiver", { exact: true })).toHaveCount(0);
});
