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
	await panel.getByRole("combobox", { name: "Event filter" }).click();
	await panel.getByRole("option", { name: "International events" }).click();
	await expect(panel.getByRole("status")).toContainText("0 events");
	await page.screenshot({ path: "test-results/playwright/all-time-event-stats.png", fullPage: true });
});
