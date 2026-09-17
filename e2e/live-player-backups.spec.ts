import { expect, test } from "@playwright/test";
import type { SeasonState } from "../lib/season/types";
import { makeAuditSeason } from "../lib/auditFixtures";
import type { SimRosterMovesEntry } from "../lib/season/simResultsSummary";

test("live player search shows current status, a card and both sides of a move", async ({ page }) => {
  const season: SeasonState = makeAuditSeason("Player search");
  const [a, b] = season.teams;
  const star = b.players[0];
  const swap = a.players[0];
  star.name = "SearchStar";
  swap.name = "SearchSwap";
  season.franchise!.inactivePool = (["academy", "free-agent", "retired"] as const).map(status => ({ player: { ...star, id: `inactive-${status}`, name: `Search ${status}` }, status, inactiveYears: 1, demotedYear: 1, lastTeamId: a.id, lastTeamName: a.name }));
  const entry: SimRosterMovesEntry = { kind: "roster-moves", seasonId: season.id, year: 1, label: "Post MSI", afterEvent: "msi", moves: [{ fromTeam: a, toTeam: b, lane: star.lane, starId: star.id, starName: star.name, starTier: star.tier, swapId: swap.id, swapName: swap.name, swapTier: swap.tier }] };
  await page.addInitScript(({ season, entry }) => {
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { season, seasonViewOpen: true, activeRealityId: season.franchise!.id, realities: [{ id: season.franchise!.id, name: "Player search", year: 1, season, history: [] }], simResultsFeed: [entry] } }));
  }, { season, entry });
  await page.goto("/");
  const search = page.getByRole("region", { name: "Find a player" });
  await expect(search).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Find a player", exact: true });
  await trigger.click();
  await expect(search.getByRole("searchbox")).toBeFocused();
  await search.getByRole("searchbox").fill("Search");
  await expect(search.getByLabel("Academy", { exact: true })).toBeVisible();
  await expect(search.getByLabel("Free agent", { exact: true })).toBeVisible();
  await expect(search.getByLabel("Retired", { exact: true })).toBeVisible();
  await expect(search.getByRole("button", { name: /SearchStar/ }).getByTitle(b.name, { exact: true }).locator("img, svg")).toHaveCount(1);
  await search.screenshot({ path: "test-results/playwright/player-search-suggestions.png" });
  // Enable desktop-only hover cards after storage hydration, without native writes.
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
  await search.getByRole("searchbox").fill("searchstar");
  await search.getByRole("button", { name: /SearchStar/ }).click();
  await expect(search).toContainText("Main roster");
  const moves = search.getByRole("list", { name: "Player roster moves" });
  await expect(moves.getByTitle(a.name, { exact: true }).locator("img, svg")).toHaveCount(1);
  await expect(moves.getByTitle(b.name, { exact: true }).locator("img, svg")).toHaveCount(1);
  await expect(search).toContainText("Year 1");
  await search.getByText("SearchStar", { exact: true }).hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "SearchStar" })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await search.screenshot({ path: "test-results/playwright/live-player-search.png" });
  await search.getByRole("button", { name: "Back to results" }).click();
  await search.getByRole("searchbox").fill("SearchSwap");
  await search.getByRole("button", { name: /SearchSwap/ }).click();
  await expect(moves.getByRole("listitem")).toContainText(b.name);
  await search.getByRole("searchbox").fill("NoSuchPlayer");
  await expect(search.getByRole("status")).toHaveText("0 matches");
  await search.getByRole("button", { name: "Close player search" }).click();
  await expect(search).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(search.getByRole("searchbox")).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("individual backup deletion can be cancelled and preserves other copies", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Backups", exact: true });
  for (const name of ["Keep copy", "Delete copy"]) {
    await panel.getByLabel("Backup name").fill(name);
    await panel.getByRole("button", { name: "Create backup", exact: true }).click();
    await expect(panel.getByLabel("Backup name")).toHaveValue("");
  }
  await panel.getByRole("button", { name: "Delete backup Delete copy", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete backup", exact: true });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByRole("button", { name: "Delete backup Delete copy", exact: true })).toBeVisible();
  const before = await page.evaluate(() => localStorage.getItem("draftsim-store"));
  await panel.getByRole("button", { name: "Delete backup Delete copy", exact: true }).click();
  await confirm.getByRole("button", { name: "Delete permanently" }).click();
  await expect(panel.getByRole("status")).toHaveText("Backup deleted.");
  await expect(panel.getByRole("list")).not.toContainText("Delete copy");
  await expect(panel.getByRole("list")).toContainText("Keep copy");
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe(before);
  await page.screenshot({ path: "test-results/playwright/backup-delete.png" });
});

test("external backup folder can be disabled in the recovery panel", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Backups", exact: true })).toBeVisible();
  await page.evaluate(() => {
    let folder: string | null = "D:/Test backups";
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {
      invoke: async (command: string) => {
        if (command === "backup_destination_get") return folder;
        if (command === "backup_destination_disable") { folder = null; return; }
        if (command === "backup_list") return [];
        throw new Error(`Unexpected IPC: ${command}`);
      },
    } });
  });
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Backups", exact: true });
  await panel.getByText("Storage & external copies", { exact: true }).click();
  await expect(panel).toContainText("D:/Test backups");
  await panel.getByRole("button", { name: "Disable external backups" }).click();
  await expect(panel).toContainText("External backups: Disabled");
  await expect(panel.getByRole("status")).toContainText("Existing copies have been kept");
  await expect(panel.getByRole("button", { name: "Disable external backups" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Choose external folder" })).toBeEnabled();
});
