import { test, expect } from "@playwright/test";
import type { SeasonHistoryEntry } from "../lib/season/history";

test("champion role icons filter totals and players before applying the top limit", async ({ page }) => {
  const career = (
    playerId: string,
    lane: "top" | "middle" | "bottom" | undefined,
    champs: { championId: number; games: number; wins: number }[],
  ) => ({
    playerId, playerName: playerId, leagueId: "LCK" as const, lane,
    games: champs.reduce((sum, champ) => sum + champ.games, 0),
    kills: 0, mvps: 0, allPro: 0, splitTitles: 0, intlAppearances: 0, intlTitles: 0, champs,
  });
  const entry: SeasonHistoryEntry = {
    id: "role-fixture", name: "Role Fixture", archivedAt: 1, complete: true,
    champion: null, runnerUp: null, intlChampions: {}, splitChampions: {},
    playerCareers: [
      career("Top player", "top", Array.from({ length: 10 }, (_, index) => ({
        championId: index + 1, games: 100 - index, wins: 50,
      }))),
      career("Mid player", "middle", [{ championId: 1, games: 20, wins: 15 }]),
      career("Bot player", "bottom", [{ championId: 11, games: 5, wins: 3 }]),
      career("Unknown role", undefined, [{ championId: 1, games: 10, wins: 2 }]),
    ],
  };
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.addInitScript(history => localStorage.setItem("draftsim-store", JSON.stringify({
    version: 7, state: { seasonHistory: history, realities: [], season: null },
  })), [entry]);
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
  const champions = page.getByRole("region", { name: "Most played champions", exact: true });
  const roles = champions.getByRole("group", { name: "Champion roles" });
  await expect(champions).toContainText("Showing 10 of 11 champions");
  await expect(roles.getByRole("button", { name: "All roles", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(roles.locator("img")).toHaveCount(5);
  await champions.locator("summary").first().click();
  await expect(champions.getByRole("button", { name: "Unknown role", exact: true })).toBeVisible();

  await roles.getByRole("button", { name: "Mid", exact: true }).click();
  await expect(champions).toContainText("Showing 1 of 1 champions");
  await expect(champions.locator("summary")).toHaveAttribute("aria-label", /: 20 games$/);
  await expect(champions.getByRole("button", { name: "Mid player", exact: true })).toBeVisible();
  await expect(champions.getByRole("button", { name: "Top player", exact: true })).toHaveCount(0);
  await expect(champions.getByRole("button", { name: "Unknown role", exact: true })).toHaveCount(0);
  await expect(champions.getByText("75.0%", { exact: true })).toHaveCount(2);
  await champions.screenshot({ path: "test-results/playwright/champion-role-mid.png" });

  await roles.getByRole("button", { name: "Bot", exact: true }).click();
  await expect(champions.locator("summary")).toHaveAttribute("aria-label", /: 5 games$/);
  await champions.locator("summary").click();
  await expect(champions.getByRole("button", { name: "Bot player", exact: true })).toBeVisible();

  await roles.getByRole("button", { name: "Support", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(roles.getByRole("button", { name: "Support", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(champions).toContainText("No champion usage recorded for Support in this history.");
  await expect(champions.locator("summary")).toHaveCount(0);
  await roles.getByRole("button", { name: "All roles", exact: true }).click();
  await expect(champions).toContainText("Showing 10 of 11 champions");
  await expect(champions.locator("summary").first()).toHaveAttribute("aria-label", /: 130 games$/);
});
