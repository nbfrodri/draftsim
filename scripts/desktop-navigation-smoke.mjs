import { chromium, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Called only by the guarded disposable Windows installer smoke runner.
if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted") {
  throw new Error("Native navigation smoke requires a disposable GitHub-hosted runner.");
}
const output = process.argv[2];
if (!output) throw new Error("Expected diagnostic output directory");
await mkdir(output, { recursive: true });
let browser;
let connectionError;
for (let attempt = 0; attempt < 60; attempt++) {
  try { browser = await chromium.connectOverCDP("http://127.0.0.1:9333"); break; }
  catch (error) { connectionError = error; await new Promise(resolve => setTimeout(resolve, 500)); }
}
if (!browser) {
  await writeFile(path.join(output, "native-navigation-error.txt"), String(connectionError?.stack));
  throw new Error("Native WebView debugging connection failed", { cause: connectionError });
}
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(20_000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await expect(page.getByRole("heading", { name: "DRAFTSIM", exact: true })).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "DRAFTSIM", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Continue playing" }).getByRole("button").click();
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeVisible();

  // A modal consumes Escape; a held key must not then exit its parent page.
  await page.getByRole("button", { name: "Abandon", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.down("Escape");
  await page.keyboard.down("Escape");
  await page.keyboard.up("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(save).toBeVisible();

  // Native HTML dialog + nested confirmation: dismiss one level, restore focus.
  await page.getByRole("button", { name: "Backups", exact: true }).click();
  const backups = page.getByRole("dialog", { name: "Backups", exact: true });
  const name = `Navigation smoke ${Date.now()}`;
  await backups.getByLabel("Backup name").fill(name);
  await backups.getByRole("button", { name: "Create backup", exact: true }).click();
  const deletion = backups.getByRole("button", { name: `Delete backup ${name}`, exact: true });
  await expect(deletion).toBeVisible({ timeout: 60_000 });
  await deletion.click();
  await expect(page.getByRole("dialog", { name: "Delete backup", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(backups).toBeVisible();
  await expect(deletion).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(backups).toHaveCount(0);
  await expect(save).toBeVisible();

  await save.click();
  await expect(page.getByText("Saved to reality", { exact: true })).toBeVisible();
  const started = Date.now();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "DRAFTSIM", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  const exitMs = Date.now() - started;
  const stored = await page.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const root = await invoke("plugin:path|resolve_directory", { directory: 14, path: "" });
    const rows = await invoke("plugin:sql|select", { db: `sqlite:${root}draftsim.db`, query: "SELECT state_json FROM global_state WHERE store_key = ?", values: ["draftsim-store"] });
    const state = JSON.parse(rows[0].state_json);
    if (state._draftsimFragments?.includes("season")) {
      const parts = await invoke("plugin:sql|select", { db: `sqlite:${root}draftsim.db`, query: "SELECT value_json FROM global_fragments WHERE store_key = ? AND fragment_key = ?", values: ["draftsim-store", "season"] });
      state.season = JSON.parse(parts[0].value_json);
    }
    return { seasonViewOpen: state.seasonViewOpen, activeRealityId: state.activeRealityId, teams: state.season.teams.length };
  });
  expect(stored).toEqual({ seasonViewOpen: false, activeRealityId: "Install-smoke-fixture", teams: 60 });
  await page.screenshot({ path: path.join(output, "native-navigation.png") });
  expect(errors).toEqual([]);
  await writeFile(path.join(output, "native-navigation.json"), JSON.stringify({ rootEscape: "passed", modalEscape: "passed", heldEscape: "passed", nestedDialogFocus: "passed", seasonExitSqliteCommit: "passed", exitMs, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, "native-navigation-failure.png") }).catch(() => {});
  await writeFile(path.join(output, "native-navigation-error.txt"), `${error.stack}\n${errors.join("\n")}`);
  throw error;
} finally { await browser.close(); }
