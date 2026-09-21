import { test, expect } from "@playwright/test";
import type { SeasonHistoryEntry } from "../lib/season/history";

test("large career boards remain responsive and expose every rank on demand", async ({ page }) => {
  test.setTimeout(120_000);
  const team = { name: "T1", leagueId: "LCK" as const, color: "#c33", iconKey: "star" };
  const entries: SeasonHistoryEntry[] = Array.from({ length: 100 }, (_, year) => ({
    id: `year-${year}`, name: `Fixture Year ${year + 1}`, franchiseYear: year + 1, archivedAt: year + 1, complete: true,
    champion: team, runnerUp: null, intlChampions: { worlds: team }, splitChampions: { winter: { LCK: team } },
    playerCareers: Array.from({ length: 200 }, (_, index) => ({ playerId: `p-${Math.floor(year / 4)}-${index}`, playerName: `Player ${Math.floor(year / 4)} ${index}`, leagueId: "LCK", teamName: "T1", lane: "top", games: 100, kills: 500, mvps: 4, allPro: 0, splitTitles: 1, intlAppearances: 1, intlTitles: 1, champs: [{ championId: 1, games: 100, wins: 60 }] })),
  }));
  await page.addInitScript(history => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { seasonHistory: history, realities: [], season: null } })), entries);
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  const started = Date.now();
  await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
  await expect(page.getByText("All-Time Records", { exact: false })).toBeVisible();
  const count = await page.locator(".cv-row").count();
  console.log(JSON.stringify({ recordsOpenMs: Date.now() - started, renderedRecordRows: count }));
  expect(count).toBeLessThan(800);
  const paging = page.getByRole("navigation", { name: "Record pages" }).first();
  await expect(paging).toContainText("1-20 of 100");
  await expect(paging.getByRole("button", { name: "Previous records" })).toBeDisabled();
  await paging.screenshot({ path: "test-results/playwright/record-pagination.png" });
  await paging.getByRole("button", { name: "Next records" }).click();
  await expect(paging).toContainText("21-40 of 100");
  await paging.getByRole("button", { name: "Previous records" }).click();
  await expect(paging).toContainText("1-20 of 100");
});
