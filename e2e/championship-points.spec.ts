import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { BUNDLED_TEAMS } from "../lib/season/realTeams";
import { LEAGUE_IDS, type SeasonState } from "../lib/season/types";

const screenshots = "test-results/championship-points";
const screenshotStyle = '[aria-label="Save status"] { visibility: hidden !important; }';

function fixture(complete = false): SeasonState {
  const season: SeasonState = makeAuditSeason("Championship points review");
  delete season.franchise;
  for (const league of LEAGUE_IDS) {
    const teams = season.teams.filter(t => t.leagueId === league);
    for (let i = 0; i < teams.length; i++) Object.assign(teams[i], BUNDLED_TEAMS[league][i]);
    const ids = teams.map(t => t.id);
    season.splitResults.winter = { ...season.splitResults.winter, [league]: ids };
    season.splitResults.spring = { ...season.splitResults.spring, [league]: [ids[1], ids[0], ...ids.slice(2)] };
    if (complete) season.splitResults.summer = { ...season.splitResults.summer, [league]: [ids[2], ids[1], ids[0], ...ids.slice(3)] };
  }
  const [a, b] = season.teams;
  const others = LEAGUE_IDS.slice(1).map(league => season.teams.find(t => t.leagueId === league)!.id);
  season.intlResults = { "first-stand": [a.id, b.id, ...others], msi: [b.id, a.id, ...others] };
  if (complete) {
    season.status = "complete";
    season.champion = a.id;
    season.intlResults.worlds = [a.id, b.id];
  }
  return season;
}

async function seed(page: Page, state: unknown) {
  await page.addInitScript(state => {
    if (!localStorage.getItem("draftsim-store")) localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state }));
  }, state);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
}

test("live standings show each region's team logos and the five-event points breakdown", async ({ page }) => {
  const season = fixture();
  await seed(page, { season, seasonViewOpen: true });
  const panel = page.getByRole("region", { name: "Championship points", exact: true });
  await panel.getByRole("button", { name: /Championship Points/ }).click();
  await expect(panel.getByTestId("championship-points-row")).toHaveCount(60);
  const logos = await panel.locator('h3 img').evaluateAll(images => images.map(img => img.getAttribute("src")));
  expect(logos).toEqual(LEAGUE_IDS.map(league => `/league-logos/${league}.png`));
  const row = panel.locator(`[data-team-id="${season.teams[0].id}"]`);
  expect(await row.locator("td").allTextContents()).toEqual(["10", "15", "8", "12", "—", "45"]);
  await expect(row.locator('img[src^="/team-logos/"]')).toBeVisible();
  const ninth = panel.locator(`[data-team-id="${season.teams[8].id}"]`);
  await expect(ninth.locator("td").first()).toHaveText("0");
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    // Frame the complete table below the dashboard's fixed navigation buttons.
    const panelHeight = await panel.evaluate(element => element.getBoundingClientRect().height);
    await page.setViewportSize({ width, height: Math.ceil(panelHeight) + 320 });
    await panel.evaluate(element => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 160));
    await panel.screenshot({ path: `${screenshots}/live-regional-points-${width}.png`, style: screenshotStyle });
  }
});

test("archived points survive reload and appear in Timeline By Season with their original team identity", async ({ page }) => {
  const season = fixture(true);
  await seed(page, { season, seasonViewOpen: true });
  await page.getByRole("button", { name: "Add to Season History", exact: true }).click();
  await expect(page.getByText("Added to Season History", { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.seasonHistory?.[0]?.championshipPoints?.length)).toBe(60);
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.seasonHistory[0].championshipPoints);
  expect(snapshot.find((row: { teamId: string }) => row.teamId === season.teams[0].id).total).toBe(51);
  await page.reload();
  await page.getByRole("button", { name: "Main Menu", exact: true }).click();
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "By Season", exact: true }).click();
  await page.getByText(season.name, { exact: true }).first().click();
  const panel = page.getByRole("region", { name: "Championship points", exact: true });
  await panel.getByRole("button", { name: /Championship Points/ }).click();
  await expect(panel.getByTestId("championship-points-row")).toHaveCount(60);
  const row = panel.locator(`[data-team-id="${season.teams[0].id}"]`);
  expect(await row.locator("td").allTextContents()).toEqual(["10", "15", "8", "12", "6", "51"]);
  await expect(row.locator('img[src^="/team-logos/"]')).toBeVisible();
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await panel.screenshot({ path: `${screenshots}/hall-by-season-points-${width}.png`, style: screenshotStyle });
  }
});

test("legacy Hall entries report missing points instead of showing invented zeroes", async ({ page }) => {
  await seed(page, { seasonHistory: [{ id: "legacy-points", name: "Legacy points year", archivedAt: 1,
    complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {} }] });
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "By Season", exact: true }).click();
  await page.getByText("Legacy points year", { exact: true }).first().click();
  const panel = page.getByRole("region", { name: "Championship points", exact: true });
  await panel.getByRole("button", { name: /Championship Points/ }).click();
  await expect(panel).toContainText("Championship points were not recorded for this season.");
  await expect(panel.getByTestId("championship-points-row")).toHaveCount(0);
});
