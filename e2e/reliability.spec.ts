import { makeAuditSeason } from "../lib/auditFixtures";
import { expect, test, type Page } from "@playwright/test";
async function holdOperationPaint(page: Page) {
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    const callbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => { callbacks.push(callback); return 0; };
    (window as unknown as { releaseOperation: () => void }).releaseOperation = () => {
      window.requestAnimationFrame = original;
      callbacks.forEach(callback => original.call(window, callback));
    };
  });
}
async function releaseOperationPaint(page: Page) {
  await page.evaluate(() => (window as unknown as { releaseOperation: () => void }).releaseOperation());
}

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
  const prompts: string[] = [];
  page.on("dialog", async dialog => { prompts.push(dialog.type()); await dialog.accept(); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  await page.evaluate(() => {
    localStorage.setItem("draftsim-backup-1", localStorage.getItem("draftsim-store")!);
    localStorage.setItem("draftsim-store", "{broken");
    localStorage.setItem("draftsim-before-restore-1", "older original");
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
  await holdOperationPaint(page);
  const reloaded = page.waitForEvent("domcontentloaded");
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  const progress = page.getByRole("dialog", { name: "Restoring backup", exact: true });
  await expect(progress).toBeVisible();
  await expect(progress).toContainText("Estimated remaining");
  await expect(progress).toContainText("7 steps after this");
  await page.mouse.click(5, 5);
  await page.keyboard.press("Escape");
  await expect(progress).toBeVisible();
  await page.screenshot({ path: "test-results/playwright/restore-progress-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/playwright/restore-progress-mobile.png" });
  await releaseOperationPaint(page);
  await reloaded;
  await expect(page.getByRole("button", { name: /Solo Single Series/ })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("draftsim-before-restore-") && localStorage.getItem(key) === "{broken"))).toBe(true);
  expect(prompts).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("draftsim-before-restore-")).length)).toBe(1);
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
  await panel.getByLabel("Backup name").fill("Before playoffs");
  await panel.getByRole("button", { name: "Create backup", exact: true }).click();
  await expect(panel.getByLabel("Backup name")).toHaveValue("");
  await expect(panel.getByRole("status")).toContainText("Backup created");
  await expect(panel.getByRole("button", { name: "Review restore" }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/playwright/backups-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/playwright/backups-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Backups", exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  await expect(panel.getByRole("list")).toContainText("Before playoffs");
  await panel.getByRole("button", { name: "Review restore" }).first().click();
  await expect(page.getByRole("dialog", { name: "Restore saved data" })).toContainText("Before playoffs");
});

test("reality deletion reports a failed backup and retries without losing other realities", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const seasons = [makeAuditSeason("Delete fixture"), makeAuditSeason("Keep fixture")];
  await page.addInitScript(seasons => {
    if (localStorage.getItem("draftsim-store")) return;
    localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: {
      realities: seasons.map(season => ({ id: season.franchise.id, name: season.name, year: 1, season, history: [] })),
    } }));
  }, seasons);
  await page.goto("/");
  await page.getByRole("button", { name: /Realities/ }).click();
  const row = page.getByText("Delete fixture", { exact: true }).locator("../..");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreStorage: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("draftsim-backup-")) throw new DOMException("Backup quota exceeded", "QuotaExceededError");
      original.call(this, key, value);
    };
  });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  // Hold the pre-backup paint boundary to inspect the busy UI deterministically.
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    const callbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = callback => { callbacks.push(callback); return 0; };
    (window as unknown as { releaseDelete: () => void }).releaseDelete = () => {
      window.requestAnimationFrame = original;
      callbacks.forEach(callback => original.call(window, callback));
    };
  });
  await row.getByRole("button", { name: "Confirm", exact: true }).click();
  const progress = page.getByRole("dialog", { name: "Deleting reality", exact: true });
  await expect(progress).toBeVisible();
  await expect(progress.getByRole("status")).toContainText("Save current changes");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(progress).toBeFocused();
  const menu = page.getByRole("button", { name: /Menu/ });
  expect(await menu.evaluate(button => { button.focus(); return document.activeElement === button; })).toBe(false);
  await page.screenshot({ path: "test-results/playwright/delete-progress-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/playwright/delete-progress-mobile.png" });
  expect(await progress.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => (window as unknown as { releaseDelete: () => void }).releaseDelete());
  await expect(progress).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Could not delete the reality" })).toContainText("Backup quota exceeded");
  await expect(row.getByRole("button", { name: "Confirm", exact: true })).toBeEnabled();
  await expect(page.getByText("Keep fixture", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreStorage: () => void }).restoreStorage());
  await row.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Delete fixture", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Could not delete the reality" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.realities.map((r: { id: string }) => r.id))).toEqual(["Keep fixture"]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("draftsim-backup-")).some(key => JSON.parse(localStorage.getItem(key)!).state.realities.some((r: { id: string }) => r.id === "Delete fixture")))).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /Realities/ }).click();
  await expect(page.getByText("Delete fixture", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Keep fixture", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("backups close on an outside click but not from an inside click", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Backups", exact: true });
  await panel.getByRole("heading", { name: "Backups", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Backups", exact: true })).toBeFocused();
});

test("reality import review shows archive facts and can be cancelled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const season = makeAuditSeason("Review fixture");
  await page.goto("/");
  await page.getByRole("button", { name: /Realities/ }).click();
  await page.locator('input[placeholder^="REAL1:"]').fill(JSON.stringify({ kind: "reality", version: 1, reality: { id: season.franchise.id, name: season.name, year: 12, season, history: [] } }));
  await holdOperationPaint(page);
  await page.getByRole("button", { name: "Import code", exact: true }).click();
  const preparing = page.getByRole("dialog", { name: "Preparing reality import", exact: true });
  await expect(preparing).toBeVisible();
  await expect(preparing).toContainText("Read the archive");
  await page.screenshot({ path: "test-results/playwright/import-prepare-desktop.png" });
  await releaseOperationPaint(page);
  const review = page.getByRole("dialog", { name: "Review reality import", exact: true });
  await expect(review.getByRole("heading", { name: "Review fixture" })).toBeVisible();
  await expect(review).toContainText("Current year");
  await expect(review).toContainText("Adds a new reality");
  await page.screenshot({ path: "test-results/playwright/reality-review-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/playwright/reality-review-mobile.png" });
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(review).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.realities.length)).toBe(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Import code", exact: true }).click();
  await expect(review).toBeVisible();
  await holdOperationPaint(page);
  await review.getByRole("button", { name: "Import", exact: true }).click();
  const progress = page.getByRole("dialog", { name: "Importing reality", exact: true });
  await expect(progress).toBeVisible();
  await expect(progress).toContainText("3 steps after this");
  await page.screenshot({ path: "test-results/playwright/import-progress-desktop.png" });
  await releaseOperationPaint(page);
  await expect(progress).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.realities.length)).toBe(1);
  await page.locator('input[placeholder^="REAL1:"]').fill(JSON.stringify({ kind: "reality", version: 1, reality: { id: season.franchise.id, name: season.name, year: 12, season, history: [] } }));
  await page.getByRole("button", { name: "Import code", exact: true }).click();
  await expect(review).toContainText("Replaces an existing reality");
  await page.screenshot({ path: "test-results/playwright/reality-review-replace.png" });
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
});


test("backup history failure exits loading and can be retried", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("draftsim-store"))).not.toBeNull();
  await page.evaluate(() => {
    localStorage.setItem("draftsim-backup-1", localStorage.getItem("draftsim-store")!);
    const original = Storage.prototype.key;
    Storage.prototype.key = function(index) {
      Storage.prototype.key = original;
      throw new Error(`Cannot read backup catalogue at ${index}`);
    };
  });
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Backups", exact: true });
  await expect(panel).toContainText("Backup history unavailable");
  await expect(panel.getByRole("status")).toHaveCount(0);
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel.getByRole("button", { name: "Refresh copies" }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Review restore" })).toBeVisible();
});

test("confirmation modal decorations do not create scrollbars", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Import Tournament Code" }).click();
  await page.locator("textarea").fill(JSON.stringify(fixture()));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review import" });
  await expect(dialog).toBeVisible();
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => dialog.evaluate(node => ({
      horizontal: node.scrollWidth > node.clientWidth,
      vertical: node.scrollHeight > node.clientHeight,
    }))).toEqual({ horizontal: false, vertical: false });
  }
});
