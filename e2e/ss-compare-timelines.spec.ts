import { expect, test } from "@playwright/test";
import type { SeasonHistoryEntry } from "../lib/season/history";
import type { SSHolder } from "../lib/season/types";

const holder = (index: number, seasonId: string): SSHolder => ({ playerId: `holder-${index}`, playerName: `Holder ${String(index).padStart(2, "0")}`, lane: "top", team: { teamId: "t1", teamName: "T1", leagueId: "LCK" }, evidence: { baseTier: "S+", lane: "top", seasonId, phaseIndex: index, phaseLabel: "Winter", games: 16, score: 7.2 } });

test("compare searches every holder, caps at four, highlights overlap and supports keyboard dismissal", async ({ page }) => {
	// One holder per review respects the worldwide seat invariant and places holder-13 beyond the old top twelve.
	const history: SeasonHistoryEntry[] = [1, 2].map(year => ({ id: `y${year}`, name: `Year ${year}`, franchiseYear: year, archivedAt: year, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, ssOpening: [],
		ssReviews: Array.from({ length: 14 }, (_, index) => ({ phaseIndex: index, label: "Winter", split: "winter", holders: [holder(index, `y${year}`)] })),
		phaseRosters: [{ phaseIndex: 0, label: "Winter", kind: "split", split: "winter", teams: [{ teamId: "t1", teamName: "T1", leagueId: "LCK", players: Array.from({ length: 14 }, (_, index) => ({ id: `holder-${index}`, name: `Holder ${String(index).padStart(2, "0")}`, lane: "top", tier: "S+" })) }] }],
	}));
	await page.addInitScript(entries => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { seasonHistory: entries, realities: [], season: null } })), history);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	await page.getByRole("button", { name: /^Season History/ }).click();
	await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
	await page.getByRole("region", { name: "All-time SS records" }).getByRole("button", { name: /^SS records/ }).click();
	const panel = page.getByRole("region", { name: "Compare SS timelines", exact: true });
	const search = panel.getByRole("combobox", { name: "Find an SS holder" });
	await expect(panel.getByRole("group", { name: "Quick picks" })).toBeVisible();
	await panel.getByRole("combobox", { name: "Compare role" }).click();
	await panel.getByRole("option", { name: "Mid", exact: true }).click();
	await search.fill("Holder");
	await expect(panel.getByText("No matching unselected SS holders.")).toBeVisible();
	await search.press("Escape");
	await panel.getByRole("combobox", { name: "Compare role" }).click();
	await panel.getByRole("option", { name: "All roles", exact: true }).click();
	await panel.getByRole("combobox", { name: "Compare region" }).click();
	await panel.getByRole("option", { name: "LPL", exact: true }).click();
	await search.click();
	await expect(panel.getByText("No matching unselected SS holders.")).toBeVisible();
	await search.press("Escape");
	await panel.getByRole("combobox", { name: "Compare region" }).click();
	await panel.getByRole("option", { name: "All regions", exact: true }).click();
	await search.fill("Holder 13");
	await expect(panel.getByRole("option", { name: /Holder 13/ })).toBeVisible();
	await search.press("Enter");
	await expect(panel.getByLabel("Selected player count")).toHaveText("1/4 players");
	for (const number of [0, 1, 2]) {
		await search.fill(`Holder ${String(number).padStart(2, "0")}`);
		await search.press("Enter");
	}
	await expect(panel.getByLabel("Selected player count")).toHaveText("4/4 players");
	await search.fill("Holder 03");
	await search.press("Enter");
	await expect(panel.getByRole("status")).toContainText("Remove a player to add another");
	await expect(panel.getByRole("list", { name: "Selected players" }).getByRole("listitem")).toHaveCount(4);
	await search.press("Escape");
	await expect(search).toHaveAttribute("aria-expanded", "false");
	await expect(panel).toBeVisible();
	const lanes = panel.getByRole("table", { name: "SS timeline comparison", exact: true });
	await expect(lanes.locator("thead [data-overlap='true']")).toHaveCount(2);
	await expect(lanes.locator("tbody [data-overlap='true']")).toHaveCount(8);
	await expect(panel.getByRole("table", { name: "SS comparison summary" })).toContainText("Year 1");
	await panel.screenshot({ path: "test-results/playwright/ss-compare-desktop.png" });
	await panel.getByRole("button", { name: "Remove Holder 00", exact: true }).click();
	await expect(panel.getByLabel("Selected player count")).toHaveText("3/4 players");
	await search.fill("Holder 03");
	await search.press("ArrowDown");
	await search.press("Enter");
	await expect(panel.getByLabel("Selected player count")).toHaveText("4/4 players");
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(panel.getByText("Scroll horizontally to see every season →")).toBeVisible();
	await panel.screenshot({ path: "test-results/playwright/ss-compare-mobile.png" });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
