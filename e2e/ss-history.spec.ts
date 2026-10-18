import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import type { SeasonHistoryEntry } from "../lib/season/history";

test("SS timeline, phase cards and career history distinguish played tiers from closing ownership", async ({ page }) => {
	const team = { name: "T1", leagueId: "LCK" as const, iconKey: "sword", color: "#e84057" };
	const entry: SeasonHistoryEntry = {
		id: "ss-year", name: "SS Year 1", archivedAt: 1, complete: true, champion: team, runnerUp: null, intlChampions: { worlds: team }, intlPlacements: { worlds: [team] }, splitChampions: {}, ssOpening: [],
		phaseRosters: [{ phaseIndex: 0, label: "Worlds", kind: "international", event: "worlds", teams: [{ teamId: "t1", teamName: "T1", leagueId: "LCK", players: [{ id: "ss-player", name: "SS Veteran", lane: "top", tier: "S+" }] }] }],
		ssReviews: [{ version: 1, phaseIndex: 0, label: "Worlds", holders: [{ playerId: "ss-player", playerName: "SS Veteran", lane: "top", team: { teamId: "t1", teamName: "T1", leagueId: "LCK" }, decision: "gained", evidence: { baseTier: "S+", lane: "top", seasonId: "ss-year", phaseIndex: 0, phaseLabel: "Worlds", games: 16, score: 7.2 } }] }],
		playerCareers: [{ playerId: "ss-player", playerName: "SS Veteran", teamName: "T1", leagueId: "LCK", lane: "top", games: 16, kills: 50, mvps: 1, allPro: 0, splitTitles: 0, intlTitles: 0, intlAppearances: 1 }],
	};
	await page.addInitScript(({ season, entry }) => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { season: null, seasonViewOpen: false, seasonHistory: [], realities: [{ id: "ss-history", name: "SS History", year: 2, season, history: [entry] }] } })), { season: makeAuditSeason("SS History"), entry });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	await page.getByRole("button", { name: /^Season History/ }).click();
	await page.getByRole("button", { name: /Reality.*SS History/ }).click();
	await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
	await page.getByRole("button", { name: "Overall", exact: true }).click();
	await page.getByRole("button", { name: "By Season", exact: true }).click();
	const panel = page.getByRole("region", { name: "Season SS history" });
	await expect(panel).toBeVisible();
	await panel.getByRole("button", { name: /^SS history/ }).click();
	const review = panel.locator("details").filter({ has: page.getByText("Worlds · SS review · 1/5", { exact: true }) });
	await review.locator("summary").focus(); await page.keyboard.press("Enter");
	await expect(review).toContainText("Gained SS");
	await expect(review).toContainText("16 rated games");
	await expect(review).toContainText("7.20");
	await expect(review.getByText(/Vacant$/)).toHaveCount(4);
	await expect(review.getByRole("heading", { name: "Top" })).toBeVisible();
	await expect(review.getByRole("heading", { name: /^Mid/ })).toContainText("Vacant");
	await expect(review.locator("span[title='LCK']")).toBeVisible();
	await expect(review.locator("img[src='/league-logos/worlds.png']")).toBeVisible();
	await expect(review.locator("img[src*='t1']")).toBeVisible();
	await panel.screenshot({ path: "test-results/playwright/ss-timeline-desktop.png" });
	await review.getByRole("button", { name: "SS Veteran", exact: true }).hover();
	await expect(page.getByRole("tooltip")).toContainText("SS at last recorded ownership boundary");
	await expect(page.getByRole("tooltip")).toContainText("Played tier comes from the last roster snapshot");
	await page.mouse.move(0, 0);
	await expect(page.getByRole("tooltip")).toBeHidden();
	await page.getByRole("region", { name: "International Champions" }).getByRole("button", { name: "SS Veteran", exact: true }).hover();
	await expect(page.getByRole("tooltip")).toContainText("Tier during Worlds: S+. SS after Worlds · gained.");
	await page.getByRole("tooltip").screenshot({ path: "test-results/playwright/ss-historical-card.png" });
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toBeHidden();
	await expect(panel).toBeVisible();
	await page.evaluate(() => Reflect.deleteProperty(window, "__TAURI_INTERNALS__"));
	await review.getByRole("button", { name: "SS Veteran", exact: true }).click();
	const career = page.getByRole("region", { name: "Career History", exact: true });
	await career.getByRole("button", { name: /^SS career/ }).click();
	await expect(career.getByLabel("SS career summary")).toContainText("Times gained SS1");
	await expect(career.getByLabel("SS career summary")).toContainText("Reviews held1");
	await career.getByText("SS history · 1 review held", { exact: true }).click();
	await expect(career).toContainText("Gained SS");
	await expect(career.locator("details[open] span[title='LCK'] img").last()).toBeVisible();
	await expect(career.locator("details[open]").getByText("Top", { exact: true }).first()).toBeVisible();
	await expect(career.locator("details[open] img[src='/league-logos/worlds.png']").last()).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	await career.scrollIntoViewIfNeeded();
	await page.screenshot({ path: "test-results/playwright/ss-career-mobile.png" });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
