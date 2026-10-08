import { expect, test, type Page, type Route } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createSeries } from "../lib/series";
import type { SeasonState } from "../lib/season/types";

const SHOTS = "docs/screenshots/roster-outlook";
// Isolate this section from the dashboard's fixed menu/save controls in crops.
const screenshotStyle = '[aria-label="Save status"], [class~="fixed"][class~="top-3"] { visibility: hidden !important; }';

function fixture() {
  const season: SeasonState = makeAuditSeason("Roster Outlook Review");
  const [a, b] = season.teams;
  a.name = "T1";
  b.name = "Gen.G Esports";
  a.players[0] = { ...a.players[0], id: "outlook-atlas", name: "Atlas", tier: "B", badStreak: 4 };
  season.franchise!.inactivePool = season.teams.slice(0, 8).flatMap((team, index) => [
    { player: { ...team.players[1], id: `prospect-${index}`, name: index === 1 ? "Nova" : `Prospect ${index}`, tier: "S" as const, potential: "S" as const, age: 19 },
      status: "academy" as const, inactiveYears: 2, demotedYear: 1, lastTeamId: team.id, lastTeamName: team.name, shadowGrade: 8 },
    { player: { ...team.players[2], id: `unsigned-${index}`, name: index === 0 ? "Comet" : `Free Agent ${index}`, tier: "A" as const, age: 23, homeRegion: team.leagueId },
      status: "free-agent" as const, inactiveYears: 4, demotedYear: 1, lastTeamId: "", shadowGrade: 7 },
  ]);
  const tournament = Object.values(season.tournaments)[0];
  const match = tournament.matches.find(m => m.blueTeamId && m.redTeamId)!;
  const series = createSeries({ ...tournament.defaults, blueTeam: b.name, redTeam: a.name });
  series.games[0] = { ...series.games[0], status: "complete", winner: "blue", recap: {
    durationMinutes: 30, mvp: null, biggestSwing: null,
    ratings: { blue: [8, 8, 8, 8, 8], red: [3, 6, 6, 6, 6] },
    perPickIds: { blue: b.players.map(p => p.id!), red: a.players.map(p => p.id!) },
    perPickNames: { blue: b.players.map(p => p.name!), red: a.players.map(p => p.name!) },
  } };
  tournament.matches = tournament.matches.map(m => m.id === match.id ? { ...m, blueTeamId: a.id, redTeamId: b.id, series } : m);
  return season;
}

async function seed(page: Page, season: SeasonState, waitForForecast = true) {
  await page.addInitScript(state => {
    if (!localStorage.getItem("draftsim-store")) localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state }));
  }, { season, seasonViewOpen: true, activeRealityId: season.franchise!.id,
    realities: [{ id: season.franchise!.id, name: season.franchise!.name, year: 1, season, history: [] }] });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Roster outlook", exact: true });
  await panel.getByRole("button", { name: /Roster outlook/ }).click();
  if (waitForForecast) await expect(panel.getByTestId("outlook-player").first()).toBeVisible({ timeout: 60_000 });
  return panel;
}

test("live outlook covers all rosters, explains gaps, filters and fits the desktop minimum", async ({ page }) => {
  const season = fixture();
  const panel = await seed(page, season);
  await expect(panel.getByRole("heading", { name: /After Winter/ })).toBeVisible();
  await expect(panel.getByTestId("outlook-player")).toHaveCount(20);
  await panel.getByRole("button", { name: "Explain Atlas outlook" }).click();
  await expect(panel).toContainText("Underperformance streak: 4 → 5/5");
  const atlas = panel.getByTestId("outlook-player").filter({ hasText: "Atlas" });
  await expect(atlas.locator('[data-outcome="academy"]')).toHaveText("100%");
  await expect(atlas.locator('img[src*="icon-position-top"]')).toBeVisible();
  await expect(atlas.locator('img[src*="team-logos"]')).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}/01-main-roster-and-role-gap.png`, style: screenshotStyle });

  await panel.getByRole("combobox", { name: "Roster status", exact: true }).click();
  await panel.getByRole("option", { name: "Academy", exact: true }).click();
  await expect(panel.getByTestId("outlook-player")).toHaveCount(8);
  await panel.getByRole("button", { name: "Explain Nova outlook" }).click();
  await panel.screenshot({ path: `${SHOTS}/02-academy.png`, style: screenshotStyle });
  await panel.getByRole("combobox", { name: "Roster status", exact: true }).click();
  await panel.getByRole("option", { name: "Free agent", exact: true }).click();
  await expect(panel.getByTestId("outlook-player")).toHaveCount(8);
  await panel.screenshot({ path: `${SHOTS}/03-free-agents.png`, style: screenshotStyle });
  await panel.getByLabel("Search outlook players").fill("does not exist");
  await expect(panel).toContainText("No players match these filters.");
  await panel.getByRole("button", { name: "Reset outlook filters" }).click();
  await panel.getByRole("group", { name: "Outlook regions" }).getByRole("button", { name: "LCK", exact: true }).click();
  await panel.getByRole("group", { name: "Outlook roles" }).getByRole("button", { name: "Top", exact: true }).click();
  await panel.getByRole("combobox", { name: "Outlook teams", exact: true }).click();
  await panel.getByRole("option", { name: "T1 (LCK)", exact: true }).click();
  await expect(panel.getByTestId("outlook-player")).toHaveCount(1);
  await page.setViewportSize({ width: 1024, height: 760 });
  await panel.screenshot({ path: `${SHOTS}/04-filtered-minimum-desktop.png`, style: screenshotStyle });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Opening and filtering forecasts never applies the sampled demotion.
  const savedPlayer = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.season.teams[0].players[0]);
  expect(savedPlayer.id).toBe("outlook-atlas");
  expect(savedPlayer.badStreak).toBe(4);
});

test("an open transfer window updates automatically after Proceed and keeps choices explicit", async ({ page }) => {
  const season = fixture();
  season.config.playerTransfers = true;
  season.config.controlledTeamId = season.teams[0].id;
  season.phases.splice(2, 0, { kind: "transfer", event: "first-stand", label: "Post First Stand", status: "in-progress", tournamentIds: [] });
  season.phases.splice(5, 0, { kind: "transfer", event: "msi", label: "Post MSI", status: "pending", tournamentIds: [] });
  season.phases[0].status = "complete";
  season.phases[1].status = "complete";
  season.phaseIndex = 2;
  season.franchise!.pendingMidSplitDemotion = "winter";
  season.franchise!.agencyDemands = [{ id: "manual", playerId: season.teams[0].players[1].id!, playerName: season.teams[0].players[1].name,
    playerTier: "B", lane: "jungle", kind: "leave", fromTeamId: season.teams[0].id, wantRole: "fa", preferenceGap: 1.4, status: "pending" }];
  const panel = await seed(page, season);
  await expect(panel.getByRole("heading", { name: /Post First Stand.*remaining/ })).toBeVisible();
  await panel.getByLabel("Search outlook players").fill(season.teams[0].players[1].name!);
  await expect(panel).toContainText("User decision 100%");
  await panel.screenshot({ path: `${SHOTS}/05-current-window-user-choice.png`, style: screenshotStyle });
  await panel.getByRole("button", { name: "Reset outlook filters" }).click();
  await panel.getByLabel("Search outlook players").fill("Atlas");
  let nextWorker: Route | undefined;
  await page.route("**/workers/rosterOutlook.worker.js", route => { nextWorker = route; });
  await page.getByRole("button", { name: /^Proceed to/ }).click();
  await expect(panel.getByRole("heading", { name: /Post MSI/ })).toBeVisible();
  const search = panel.getByLabel("Search outlook players");
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("Atlas");
  await search.focus();
  await expect(panel).toContainText("Calculating roster probabilities");
  await expect(panel.getByTestId("outlook-player")).toHaveCount(0);
  await expect.poll(() => !!nextWorker).toBe(true);
  await panel.screenshot({ path: "docs/screenshots/roster-outlook-review/01-refresh-keeps-filters.png", style: screenshotStyle });
  await nextWorker!.abort();
  await expect(panel.getByRole("alert")).toContainText("could not run");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Atlas");
  await panel.screenshot({ path: "docs/screenshots/roster-outlook-review/02-error-keeps-filters.png", style: screenshotStyle });
  await page.unroute("**/workers/rosterOutlook.worker.js");
  await panel.getByRole("button", { name: "Retry forecast" }).click();
  await search.focus();
  await expect(panel.getByTestId("outlook-player").first()).toBeVisible({ timeout: 60_000 });
  await expect(search).toHaveValue("Atlas");
  await expect(search).toBeFocused();
  await panel.screenshot({ path: `${SHOTS}/06-updated-next-window.png`, style: screenshotStyle });
});

test("disabled roster movement does not launch a worker or claim guaranteed retention", async ({ page }) => {
  const season = fixture();
  season.config.playerTransfers = false;
  season.franchise!.aging = false;
  let workers = 0;
  await page.route("**/workers/rosterOutlook.worker.js", route => { workers++; return route.abort(); });
  const panel = await seed(page, season, false);
  await expect(panel.getByRole("heading", { name: "Automatic roster moves are disabled" })).toBeVisible();
  await expect(panel).toContainText("No automatic probabilities are available");
  await expect(panel.getByTestId("outlook-player")).toHaveCount(0);
  // Observe beyond the worker's 300 ms debounce, including a collapse/reopen.
  await panel.getByRole("button", { name: /Roster outlook/ }).click();
  await panel.getByRole("button", { name: /Roster outlook/ }).click();
  await page.waitForTimeout(700);
  expect(workers).toBe(0);
  await panel.screenshot({ path: "docs/screenshots/roster-outlook-review/03-no-automatic-window.png", style: screenshotStyle });
});

test("offseason probabilities load and a failed worker can be retried", async ({ page }) => {
  const season = fixture();
  season.status = "complete";
  season.config.playerTransfers = true;
  const panel = await seed(page, season);
  await expect(panel.getByRole("heading", { name: /Current offseason/ })).toBeVisible();
  await panel.screenshot({ path: `${SHOTS}/07-offseason.png`, style: screenshotStyle });
  await panel.getByRole("button", { name: /Roster outlook/ }).click();
  await page.route("**/workers/rosterOutlook.worker.js", route => route.abort());
  await panel.getByRole("button", { name: /Roster outlook/ }).click();
  await expect(panel.getByRole("alert")).toContainText("could not run");
  await page.unroute("**/workers/rosterOutlook.worker.js");
  await panel.getByRole("button", { name: "Retry forecast" }).click();
  await expect(panel.getByTestId("outlook-player").first()).toBeVisible({ timeout: 60_000 });
});
