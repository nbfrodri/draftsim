import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { resolveTeamLogo } from "../lib/season/realTeams";
import { marketOrigin } from "../lib/season/marketOrigin";
import type { RosterNewsEvent } from "../lib/season/playerLifecycle";
import type { SeasonHistoryEntry } from "../lib/season/history";

function fixture() {
  const season = makeAuditSeason("Market A");
  season.franchise.year = 2;
  const team = season.teams[0];
  team.name = "T1";
  delete team.logoUrl;
  const ref = { name: team.name, leagueId: team.leagueId, color: team.color, iconKey: team.iconKey, logoUrl: team.logoUrl };
  const oldOrigin = { seasonId: "old-season", year: 1, windowId: "old-season:Winter" };
  const old: RosterNewsEvent = { origin: oldOrigin, timeMark: "Winter", lane: "top", entrantName: "Winter Prospect", entrantId: "old-rookie", entrantTier: "A", entrantPotential: "S", entrantSource: "rookie", marketNote: "academy-rookie" };
  const retired: RosterNewsEvent = { ...old, origin: { ...oldOrigin, windowId: "old-season:Offseason" }, timeMark: "Offseason", entrantName: "Retired Veteran", entrantId: "retired", entrantSource: "free-agent", marketNote: "retired" };
  const history: SeasonHistoryEntry[] = [{ id: "old-season", name: "Market A Year 1", archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, franchiseYear: 1,
    marketNews: [{ ...old, team: ref }, { ...retired, team: ref }] }];
  season.rosterNews = [{ ...retired, teamId: team.id }, { ...old, teamId: team.id, origin: marketOrigin(season, "MSI window"), timeMark: "MSI window", entrantName: "Nova Signing", entrantId: "nova", entrantSource: "free-agent", marketNote: "fa-sign" }];
  const other = makeAuditSeason("Market B");
  other.rosterNews = [{ ...old, teamId: other.teams[0].id, origin: marketOrigin(other, "Winter"), entrantName: "Other Reality Rookie" }];
  return { season, history, other, team };
}
async function seed(page: Page, data: ReturnType<typeof fixture>, emptyHistory = false) {
  const { season, other, history } = data;
  await page.addInitScript(state => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state })), {
    season, seasonViewOpen: false, activeRealityId: season.franchise.id,
    realities: [{ id: season.franchise.id, name: "Market A", year: 2, season, history: emptyHistory ? [] : history },
      { id: other.franchise.id, name: "Market B", year: 1, season: other, history: [] }],
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "Roster Moves", exact: true }).click();
}

test("roster history merges live/archive news once, filters, sorts and fits narrow windows", async ({ page }) => {
  const data = fixture();
  await seed(page, data);
  const panel = page.getByRole("region", { name: "Roster moves history" });
  const rows = panel.getByTestId("market-move");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Nova Signing");
  await expect(rows.first()).toContainText("Year 2");
  await expect(rows.first()).toContainText("Free Agent");
  await expect(rows.first()).toContainText("Main roster");
  await expect(rows.first().locator('img[src*="icon-position-top"]')).toHaveCount(1);
  await expect(rows.first().locator(`img[src="${resolveTeamLogo(data.team.name)}"]`).first()).toBeVisible();
  await panel.getByRole("combobox", { name: "Movement order", exact: true }).click();
  await panel.getByRole("option", { name: "Oldest first", exact: true }).click();
  await expect(rows.first()).toContainText("Winter Prospect");
  await expect(rows.first()).toContainText("Academy");
  await panel.getByRole("combobox", { name: "Years", exact: true }).click();
  await panel.getByRole("option", { name: "Year 2", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await panel.getByRole("combobox", { name: "Statuses", exact: true }).click();
  await panel.getByRole("option", { name: "Retired", exact: true }).click();
  await expect(panel).toContainText("No movements match these filters.");
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await panel.getByLabel("Search roster players").fill("retired veteran");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Retired");
  await panel.getByRole("button", { name: "Reset filters" }).click();
  const regions = panel.getByRole("group", { name: "Regions", exact: true });
  await expect(regions.getByRole("button", { name: data.team.leagueId, exact: true }).locator("img")).toHaveCount(1);
  await regions.getByRole("button", { name: data.team.leagueId, exact: true }).click();
  await panel.getByRole("combobox", { name: "Teams", exact: true }).click();
  await expect(panel.getByRole("option", { name: `${data.team.name} (${data.team.leagueId})`, exact: true }).locator("img")).toHaveCount(1);
  await panel.getByRole("option", { name: `${data.team.name} (${data.team.leagueId})`, exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Teams", exact: true }).locator("img")).toHaveAttribute("src", resolveTeamLogo(data.team.name)!);
  await expect(rows).toHaveCount(3);
  const roles = panel.getByRole("group", { name: "Roles", exact: true });
  await expect(roles.getByRole("button", { name: "Support", exact: true }).locator('img[src*="icon-position"]')).toHaveCount(1);
  await roles.getByRole("button", { name: "Support", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await roles.getByRole("button", { name: "Top", exact: true }).click();
  await expect(roles.getByRole("button", { name: "Support", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(roles.getByRole("button", { name: "Top", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(3);
  await roles.getByRole("button", { name: "Top", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await roles.getByRole("button", { name: "All roles", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await panel.getByRole("combobox", { name: "Windows", exact: true }).click();
  for (const label of ["Post Winter Split", "Post Spring Split", "Post Summer Split"]) {
    await expect(panel.getByRole("option", { name: label, exact: true })).toBeAttached();
  }
  await panel.getByRole("option", { name: "Post Winter Split", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Post Winter Split");
  await panel.getByRole("button", { name: "Reset filters" }).click();
  await page.screenshot({ path: "test-results/playwright/market-history-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 480, height: 860 });
  await page.screenshot({ path: "test-results/playwright/market-history-narrow.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("an unfinished first-year reality is browsable without an archive and sources never mix", async ({ page }) => {
  const data = fixture();
  await seed(page, data, true);
  await expect(page.getByTestId("market-move")).toHaveCount(2);
  await page.getByRole("button", { name: /Reality.*Market B$/ }).click();
  await expect(page.getByTestId("market-move")).toHaveCount(1);
  await expect(page.getByTestId("market-move")).toContainText("Other Reality Rookie");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.activeRealityId)).toBe("Market A");
  await page.getByRole("button", { name: /Reality.*Market A$/ }).click();
  await expect(page.getByTestId("market-move")).toHaveCount(2);
});

test("large movement histories paginate and filters reset the page", async ({ page }) => {
  const data = fixture();
  const original = data.season.rosterNews![1];
  data.season.rosterNews = Array.from({ length: 75 }, (_, index) => ({ ...original, entrantName: `Prospect ${index}`, entrantId: `id-${index}` }));
  await seed(page, data, true);
  await expect(page.getByTestId("market-move")).toHaveCount(50);
  await page.getByRole("button", { name: "Next movements" }).click();
  await expect(page.getByTestId("market-move")).toHaveCount(25);
  await page.getByLabel("Search roster players").fill("Prospect 74");
  await expect(page.getByTestId("market-move")).toHaveCount(1);
});

test("failed inactive history reads expose retry without activating another reality", async ({ page }) => {
  const data = fixture();
  await seed(page, data);
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: { invoke: async () => { throw new Error("Fixture read failure"); } }, configurable: true }));
  await page.getByRole("button", { name: /Reality.*Market B$/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not load this reality" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.activeRealityId)).toBe("Market A");
  await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
  await page.getByRole("button", { name: "Retry history" }).click();
  await expect(page.getByTestId("market-move")).toContainText("Other Reality Rookie");
});


test("year links open the archived year and dropdown Escape leaves the Hall open", async ({ page }) => {
  await seed(page, fixture());
  const windows = page.getByRole("combobox", { name: "Windows", exact: true });
  await windows.click();
  await windows.press("Escape");
  await expect(windows).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "Roster moves history" })).toBeVisible();
  await page.getByRole("button", { name: "Open Year 1 in Timeline", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Roster moves history" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Timeline", exact: true })).toBeVisible();
});


test("movement team cards switch between frozen rosters and player names expose cards", async ({ page }) => {
  const data = fixture();
  const before = structuredClone(data.team.players);
  for (const player of before) player.tier = "D";
  before[0] = { ...before[0], id: "before-top", name: "Before Top" };
  const after = structuredClone(before);
  for (const [index, player] of after.entries()) player.tier = index < 3 ? "S" : "A";
  after[0] = { ...after[0], id: "nova", name: "Nova Signing" };
  data.season.rosterNews![1].teamSnapshots = [{ teamId: data.team.id, name: data.team.name, leagueId: data.team.leagueId,
    color: data.team.color, iconKey: data.team.iconKey, logoUrl: data.team.logoUrl, before, after, academyBefore: [{ ...before[0], id: "academy-before", name: "Former Academy" }], academyAfter: [{ ...after[0], id: "academy-after", name: "New Academy" }] }];
  await seed(page, data);
  await expect(page.getByLabel("Search roster players")).toBeVisible();
  // Cards are desktop-only. Enable that UI branch after browser hydration;
  // this test does not exercise native IPC or persistence.
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: { invoke: async () => null }, configurable: true }));
  await page.getByLabel("Search roster players").fill("no matching player");
  await expect(page.getByTestId("market-move")).toHaveCount(0);
  await page.getByLabel("Search roster players").fill("Nova Signing");
  const row = page.getByTestId("market-move");
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: data.team.name, exact: true }).hover();
  const card = page.getByRole("tooltip");
  await expect(card).toContainText("Nova Signing");
  await card.getByRole("button", { name: "Before", exact: true }).click();
  await expect(card).toContainText("Before Top");
  await expect(card).toContainText("Former Academy");
  await expect(card.getByRole("img", { name: "1 out of 5 stars", exact: true })).toBeVisible();
  await expect(card.getByLabel("Snapshot team strength").getByTitle("Tier D")).toBeVisible();
  await expect(card).not.toContainText("New Academy");
  await expect(card).not.toContainText("Nova Signing");
  await card.getByRole("button", { name: "After", exact: true }).click();
  await expect(card).toContainText("Nova Signing");
  await expect(card).toContainText("New Academy");
  await expect(card.getByRole("img", { name: "4.5 out of 5 stars", exact: true })).toBeVisible();
  await expect(card.getByLabel("Snapshot team strength").getByTitle("Tier S")).toBeVisible();
  await expect(card).not.toContainText("Former Academy");
  await card.screenshot({ path: "test-results/playwright/market-roster-card.png" });
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Nova Signing", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Nova Signing");
  await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
});


test("dormant SQLite history is shared by Timeline, records and market without opening the reality", async ({ page }) => {
  const data = fixture();
  await seed(page, data);
  await expect(page.getByLabel("Search roster players")).toBeVisible();
  // Simulate native reads after browser hydration; no personal database is used.
  await page.evaluate(entries => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {
      invoke: async (command: string, args: { query?: string; path?: string } = {}) => {
        if (command === "plugin:path|resolve_directory") return "fixture";
        if (command === "plugin:path|join") return "fixture/draftsim.db";
        if (command === "plugin:sql|load") return args.path;
        if (command === "plugin:sql|execute") return [0, 0];
        if (command === "plugin:sql|select") {
          if (args.query?.includes("persist_version")) return [{ value: "8" }];
          if (args.query?.includes("FROM reality_history")) return entries.map(entry => ({ entry_json: JSON.stringify(entry) }));
          return [];
        }
        return null;
      },
    } });
  }, data.history);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("button", { name: /Reality.*Market B$/ }).click();
  await expect(page.getByText("Market A Year 1", { exact: true }).first()).toBeVisible();
  for (const label of ["Records & Dynasties", "Search", "Best Rosters of All Time"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByText(/No seasons archived yet/)).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "Could not load" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Roster Moves", exact: true }).click();
  await expect(page.getByTestId("market-move").filter({ hasText: "Winter Prospect" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Open Year 1 in Timeline", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Open Year 1 in Timeline", exact: true }).first().click();
  await expect(page.getByText("Market A Year 1", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.activeRealityId)).toBe("Market A");
  await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
});


test("market filters expose tiers and paired demotions but no preseason or retained category", async ({ page }) => {
  const data = fixture();
  const original = data.season.rosterNews![1];
  data.season.rosterNews = [{ ...original, entrantName: "Promoted Prospect", entrantId: "promoted", entrantTier: "S", entrantSource: "academy", marketNote: "academy-recall", departedId: "demoted", departedName: "Demoted Starter", departedTier: "C", departedDestination: "academy" }, { ...original, marketNote: "agency-override" }];
  await seed(page, data, true);
  await expect(page.getByTestId("market-move")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Player tiers", exact: true }).click();
  await page.getByRole("option", { name: "C", exact: true }).click();
  await expect(page.getByTestId("market-move")).toHaveCount(1);
  await expect(page.getByTestId("market-move")).toContainText("Demoted Starter");
  await expect(page.getByTestId("market-move").getByTitle("Tier C")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("combobox", { name: "Movement types", exact: true }).click();
  await expect(page.getByRole("option", { name: "Player retained", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Demotion", exact: true }).click();
  await expect(page.getByTestId("market-move")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Windows", exact: true }).click();
  await expect(page.getByRole("option", { name: "Preseason", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Offseason", exact: true })).toHaveCount(1);
});
