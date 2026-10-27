import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { resolveTeamLogo } from "../lib/season/realTeams";
import type { SimYearResultEntry } from "../lib/season/simResultsSummary";

test("bulk year event statistics show team logos and player and team cards", async ({ page }) => {
	const season = makeAuditSeason("Bulk events");
	const team = season.teams[0];
	const player = team.players[0];
	const entry: SimYearResultEntry = {
		kind: "year", seasonId: season.id, year: 1, seasonName: "Year 1", splits: [], intls: [], worldsChampion: null, followedTeam: null,
		eventSummary: { events: [{ id: "e1", label: "LCK · Winter Split", split: "winter", leagueId: "LCK", games: 12, roles: [{ lane: player.lane, leader: { id: player.id!, name: "BulkLeader", score: 7.25, teamName: "T1", teamId: team.id, leagueId: "LCK" } }] }] },
	};
	await page.addInitScript(state => { if (!localStorage.getItem("draftsim-store")) localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state })); },
		{ season, seasonViewOpen: true, simResultsFeed: [entry] });
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	const feed = page.locator("#sim-results-panel");
	const block = feed.getByRole("region", { name: "Event statistics" });
	// Desktop builds render card links; enable them after storage hydration, without native writes.
	await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
	await block.getByRole("button", { name: /Event Statistics/ }).click();
	const performers = block.getByRole("list", { name: "LCK · Winter Split top performers" });
	await expect(performers).toContainText("BulkLeader");
	await expect(performers.locator(`img[src="${resolveTeamLogo("T1")}"]`)).toBeVisible();
	await expect(performers.getByText("T1", { exact: true })).toBeVisible();
	await block.screenshot({ path: "test-results/playwright/bulk-event-stats-desktop.png" });
	// Phones keep the logo; the team name stays as the card's accessible name.
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(performers.locator(`img[src="${resolveTeamLogo("T1")}"]`)).toBeVisible();
	// Visually hidden (screen-reader only), not removed.
	expect((await performers.getByText("T1", { exact: true }).boundingBox())!.width).toBeLessThanOrEqual(1);
	await block.screenshot({ path: "test-results/playwright/bulk-event-stats-phone.png" });
	// Player and team cards open from the same links.
	await page.setViewportSize({ width: 1440, height: 900 });
	await performers.getByRole("group", { name: "BulkLeader", exact: true }).focus();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await performers.getByRole("button", { name: "T1", exact: true }).focus();
	await expect(page.getByRole("tooltip")).toBeVisible();
	await page.keyboard.press("Escape");
	await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
});
