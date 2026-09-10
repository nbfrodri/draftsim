import { makeAuditSeason } from "../lib/auditFixtures";
import { expect, test } from "@playwright/test";
import { createTournament } from "../lib/tournament";
const fixture = () => createTournament({ name: "Recovery Cup", format: "single-elim",
  teams: [{ id: "one", name: "First", seed: 1, starRating: 3 }, { id: "two", name: "Second", seed: 2, starRating: 3 }],
  defaults: { format: "bo1", fearless: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", timerEnabled: false },
});

test("tournament preview cancels without mutation and applies after confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import Tournament Code" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  const before = await page.evaluate(() => localStorage.getItem("draftsim-store"));
  const tournament = fixture();
  await page.locator("textarea").fill(JSON.stringify(tournament));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Review import" });
  await expect(review).toContainText("Recovery Cup");
  await review.getByRole("button", { name: "Cancel" }).click();
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe(before);
  await page.getByRole("button", { name: "Import Tournament Code" }).click();
  await page.locator("textarea").fill(JSON.stringify(tournament));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await review.getByRole("button", { name: "Import", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.tournament?.id)).toBe(tournament.id);
  await page.reload();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.tournament?.id)).toBe(tournament.id);
});

test("recovery from blocked hydration keeps the damaged original and restores focus safely", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  await page.evaluate(() => {
    localStorage.setItem("draftsim-backup-1", localStorage.getItem("draftsim-store")!);
    localStorage.setItem("draftsim-store", "{broken");
  });
  await page.reload();
  await page.getByRole("button", { name: "Open backups", exact: true }).click();
  await page.getByRole("button", { name: "Review restore" }).click();
  const dialog = page.getByRole("dialog", { name: "Restore saved data" });
  await page.screenshot({ path: "test-results/playwright/recovery-dialog.png" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Restore", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review restore" })).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("draftsim-store"))).toBe("{broken");
  await page.getByRole("button", { name: "Review restore" }).click();
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: /Solo Single Series/ })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("draftsim-before-restore-") && localStorage.getItem(key) === "{broken"))).toBe(true);
});

test("essential data starts a season when every remote request fails", async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /New Season Mode/ }).click();
  await page.getByRole("button", { name: "Start Season", exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store") ?? "{}").state?.season?.teams?.length)).toBe(60);
});

test("failed preventive copy keeps the import unapplied and allows retry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import Tournament Code" }).click();
  await page.locator("textarea").fill(JSON.stringify(fixture()));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("draftsim-backup-")) throw new DOMException("Backup quota exceeded", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  const dialog = page.getByRole("dialog", { name: "Review import" });
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Backup quota exceeded");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.tournament)).toBeNull();
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.tournament?.name)).toBe("Recovery Cup");
});

test("restoration discards a failed queued save before the reload handler runs", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  await page.evaluate(() => {
    localStorage.setItem("draftsim-backup-1", localStorage.getItem("draftsim-store")!);
    const restoreValue = localStorage.getItem("draftsim-store");
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key === "draftsim-store" && value !== restoreValue) throw new DOMException("Full storage", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: /Solo Single Series/ }).click();
  await page.getByRole("button", { name: "BEGIN DRAFT" }).click();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  await page.getByRole("button", { name: "Open backups", exact: true }).click();
  await page.getByRole("button", { name: "Review restore" }).click();
  await page.getByRole("dialog", { name: "Restore saved data" }).getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: /Solo Single Series/ })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.series)).toBeNull();
});

test("a persisted simulation target resumes, pauses and survives another reload", async ({ page }) => {
  test.setTimeout(60000);
  const season = makeAuditSeason("Resume fixture");
  await page.addInitScript(season => {
    if (localStorage.getItem("draftsim-store")) return;
    const id = season.franchise.id;
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: {
      season, seasonViewOpen: true, activeRealityId: id,
      realities: [{ id, name: id, year: 1, season, history: [] }],
      bulkYearJobs: { [id]: { targetYear: 3, startedAt: 1, error: null } },
    } }));
  }, season);
  await page.goto("/");
  await page.getByRole("button", { name: "Resume simulation", exact: true }).click();
  await page.getByRole("button", { name: "Pause simulation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume simulation", exact: true })).toBeVisible({ timeout: 30000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.bulkYearJobs["Resume fixture"].targetYear)).toBe(3);
  const year = await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.season.franchise.year);
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume simulation", exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.season.franchise.year)).toBe(year);
});


test("backups stay in a dedicated panel and creation does not interrupt navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create backup", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Backups", exact: true });
  await expect(panel.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await panel.getByRole("button", { name: "Create backup", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Backup created");
  await expect(panel.getByRole("button", { name: "Review restore" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/playwright/backups-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/playwright/backups-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Backups", exact: true })).toBeFocused();
});
