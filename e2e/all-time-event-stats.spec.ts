import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createSeries } from "../lib/series";
import { buildEventRecord } from "../lib/season/eventHistory";
import type { SeasonHistoryEntry } from "../lib/season/history";

function record() {
	const season = makeAuditSeason("All-time");
	const t = structuredClone(Object.values(season.tournaments)[0]);
	t.teams = t.teams.slice(0, 2);
	const template = t.matches[0];
	t.matches = Array.from({ length: 4 }, (_, i) => {
		const s = createSeries({ format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: t.teams[0].name, redTeam: t.teams[1].name });
		return { ...template, id: `m${i}`, round: i + 1, feedsInto: null, blueTeamId: t.teams[0].id, redTeamId: t.teams[1].id, winner: { teamId: t.teams[0].id, blueWins: 1, redWins: 0 }, series: { ...s, status: "complete" as const, winner: "blue" as const, games: [{ ...s.games[0], id: `g${i}`, status: "complete" as const, winner: "blue" as const, bluePicks: [i + 1, null, null, null, null], redPicks: [14, null, null, null, null], blueBans: [3, null, null, null, null], blueRoles: ["top", null, null, null, null], redRoles: ["top", null, null, null, null], recap: { durationMinutes: 30, mvp: null, biggestSwing: null, perPickIds: { blue: t.teams[0].players!.map(p => p.id!), red: t.teams[1].players!.map(p => p.id!) }, ratings: { blue: [9, 7, 7, 7, 7], red: [4, 5, 5, 5, 5] } } }] } };
	});
	return buildEventRecord([t], { id: "y2:0:LCK", label: "LCK · Winter", split: "winter", leagueId: "LCK", phaseIndex: 0 });
}

test("all-time event statistics aggregate recorded years and flag legacy years as not recorded", async ({ page }) => {
	const base = { archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {} };
	const entries: SeasonHistoryEntry[] = [
		{ ...base, id: "y1", name: "Year 1", franchiseYear: 1 },
		{ ...base, id: "y2", name: "Year 2", franchiseYear: 2, archivedAt: 2, eventRecords: [record()] },
	];
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.addInitScript(history => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { seasonHistory: history, realities: [], season: null } })), entries);
	await page.goto("/");
	await page.getByRole("button", { name: /^Season History/ }).click();
	await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
	const panel = page.getByRole("region", { name: "All-time event statistics" });
	await expect(panel.getByRole("table")).toHaveCount(0);
	await panel.getByRole("button", { name: /^All-time event statistics/ }).click();
	await expect(panel.getByRole("status")).toContainText("1 event from 1 season");
	await expect(panel.getByRole("status")).toContainText("Not recorded: 1 of 2 seasons");
	await expect(panel.getByRole("table", { name: "All-time top player rankings" }).locator("tbody tr")).not.toHaveCount(0);
	await expect(panel.getByRole("heading", { name: /Most Picked/ })).toBeVisible();
	const championLimit = panel.getByRole("combobox", { name: "Champion limit", exact: true });
	await expect(championLimit).toContainText("Top 10");
	await championLimit.click();
	await panel.getByRole("listbox", { name: "Champion limit", exact: true }).getByRole("option", { name: "All", exact: true }).click();
	await expect(championLimit).toContainText("All");
	await championLimit.click();
	await championLimit.press("Escape");
	await expect(championLimit).toHaveAttribute("aria-expanded", "false");
	await expect(panel.getByRole("table", { name: "Most picked champions" })).toBeVisible();
	const events = panel.getByRole("radiogroup", { name: "Event", exact: true });
	await events.getByRole("radio", { name: "International", exact: true }).click();
	await expect(panel.getByRole("status")).toContainText("0 events");
	await expect(panel.getByRole("radiogroup", { name: "Region", exact: true })).toHaveCount(0);
	await events.getByRole("radio", { name: "Winter", exact: true }).click();
	await expect(panel.getByRole("status")).toContainText("1 event from 1 season");
	const regions = panel.getByRole("radiogroup", { name: "Region", exact: true });
	await regions.getByRole("radio", { name: "LCK", exact: true }).click();
	await expect(panel.getByRole("status")).toContainText("1 event");
	await expect(events.getByRole("radio", { name: "Winter", exact: true }).locator("svg")).toHaveCount(1);
	await expect(regions.getByRole("radio", { name: "LCK", exact: true }).locator("img")).toHaveAttribute("src", "/league-logos/LCK.png");
	await regions.getByRole("radio", { name: "LCK", exact: true }).press("ArrowRight");
	await expect(regions.getByRole("radio", { name: "LPL", exact: true })).toHaveAttribute("aria-checked", "true");
	await expect(panel.getByRole("status")).toContainText("0 events");
	await events.getByRole("radio", { name: "MSI", exact: true }).click();
	await expect(events.getByRole("radio", { name: "MSI", exact: true }).locator("img")).toHaveAttribute("src", "/league-logos/msi.png");
	await page.screenshot({ path: "test-results/playwright/all-time-event-stats.png", fullPage: true });
});

test("all-time cards pin the latest contributing year and update with year filters", async ({ page }) => {
	const event = record();
	const participant = event.scopes.find(s => s.id === "all")!.stats.players.find(p => p.lane === "top")!;
	const entries: SeasonHistoryEntry[] = [1, 2].map(year => ({ id: `pin-y${year}`, name: `Year ${year}`, franchiseYear: year, archivedAt: year, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, eventRecords: [event] }));
	await page.addInitScript(history => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { seasonHistory: history, realities: [], season: null } })), entries);
	await page.goto("/");
	await page.getByRole("button", { name: /^Season History/ }).click();
	await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
	const panel = page.getByRole("region", { name: "All-time event statistics" });
	await panel.getByRole("button", { name: /^All-time event statistics/ }).click();
	await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
	await panel.getByRole("radio", { name: "Winter", exact: true }).click();
	const row = panel.getByRole("table", { name: "All-time top player rankings" }).locator("tbody tr").filter({ hasText: participant.name });
	const player = row.getByRole("group", { name: participant.name, exact: true });
	await player.focus();
	await expect(page.getByRole("tooltip")).toContainText("Year 2 · Records cover Year 1 – Year 2");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await row.getByRole("button", { name: participant.teams[0].name, exact: true }).focus();
	await expect(page.getByRole("tooltip")).toContainText("Year 2 · Records cover Year 1 – Year 2");
	await page.keyboard.press("Escape");
	await panel.getByRole("combobox", { name: "To year", exact: true }).click();
	await panel.getByRole("option", { name: "Year 1", exact: true }).click();
	await player.focus();
	await expect(page.getByRole("tooltip")).toContainText("Year 1 · Records cover Year 1");
	await page.keyboard.press("Escape");
	await expect(panel).toBeVisible();
});
