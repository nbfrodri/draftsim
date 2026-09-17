import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";

test("main menu groups modes and tools and fits narrow windows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DRAFTSIM", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "DraftSim logo" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Continue playing" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Game modes" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Tools & libraries" }).getByRole("button")).toHaveCount(2);
  await page.screenshot({ path: "test-results/playwright/main-menu-empty.png", fullPage: true });
  await page.setViewportSize({ width: 480, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/playwright/main-menu-narrow.png", fullPage: true });
  const library = page.getByRole("button", { name: /Meta Tier Lists/ });
  await library.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Game modes" })).toHaveCount(0);
});

test("continue reality appears before game modes and opens the existing season", async ({ page }) => {
  const season = makeAuditSeason("A long-running reality");
  await page.addInitScript(season => {
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { season, seasonViewOpen: false, activeRealityId: season.franchise.id, realities: [{ id: season.franchise.id, name: season.franchise.name, year: 1, season, history: [] }] } }));
  }, season);
  await page.goto("/");
  const resume = page.getByRole("region", { name: "Continue playing" });
  await expect(resume).toContainText("A long-running reality");
  const modes = page.getByRole("region", { name: "Game modes" });
  expect((await resume.boundingBox())!.y).toBeLessThan((await modes.boundingBox())!.y);
  await page.screenshot({ path: "test-results/playwright/main-menu-resume.png", fullPage: true });
  await resume.getByRole("button").click();
  await expect(resume).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.seasonViewOpen)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.season.id)).toBe(season.id);
});


test("Hall opens from the initial menu and timeline cards keep event-specific winners", async ({ page }) => {
  const team = { name: "Snapshot Winners", leagueId: "LCK", iconKey: "shield", color: "#c8aa6e" };
  const events = ["winter", "msi", "worlds"];
  const entry = { id: "snapshot-year", name: "Snapshot Year", archivedAt: 1, complete: true, champion: team, runnerUp: null,
    intlChampions: { msi: team, worlds: team }, splitChampions: { winter: { LCK: team } },
    phaseRosters: events.map((event, i) => ({ phaseIndex: i, label: event, kind: event === "winter" ? "split" : "international", ...(event === "winter" ? { split: event } : { event }), teams: [{ teamId: "winner", teamName: team.name, leagueId: "LCK", players: ["top", "jungle", "middle", "bottom", "support"].map((lane, j) => ({ id: `${event}-${j}`, name: `${event} Player ${j}`, tier: "S", lane })) }] })),
  };
  await page.addInitScript(entry => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { season: null, seasonViewOpen: false, seasonHistory: [entry] } })), entry);
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Season History/ })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "Overall", exact: true }).click();
  const timeline = page.locator("ol").filter({ hasText: "Snapshot Year" });
  await timeline.getByText("MSI", { exact: true }).locator("..").getByRole("button", { name: /Snapshot Winners/ }).hover();
  await expect(page.getByRole("tooltip")).toContainText("msi Player 0");
  await expect(page.getByRole("tooltip")).not.toContainText("worlds Player 0");
  await page.mouse.move(0, 0);
  await page.getByRole("button", { name: "LCK", exact: true }).click();
  await timeline.getByRole("button", { name: /Snapshot Winners/ }).hover();
  await expect(page.getByRole("tooltip")).toContainText("winter Player 0");
  await expect(page.getByRole("tooltip")).not.toContainText("worlds Player 0");
});
