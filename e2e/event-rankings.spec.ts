import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createSeries } from "../lib/series";
import { recordEventCheckpoint } from "../lib/eventStats";
import { buildSeasonHistoryEntry } from "../lib/season/history";

function eventFixture() {
	const season = makeAuditSeason("Event UI");
	let t = structuredClone(Object.values(season.tournaments)[0]);
	t.name = "Event UI"; t.seasonId = undefined; t.teams = t.teams.slice(0, 2); t.teams[0].players![0].tier = "B";
	const template = t.matches[0]; t.matches = [];
	t.championLanes = { "1": ["top", "middle"], "3": ["middle"] };
	for (let i = 0; i < 12; i++) {
		const s = createSeries({ format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: t.teams[0].name, redTeam: t.teams[1].name });
		t.matches.push({ ...template, id: `m${i}`, round: i + 1, feedsInto: null, blueTeamId: t.teams[0].id, redTeamId: t.teams[1].id, winner: { teamId: t.teams[0].id, blueWins: 1, redWins: 0 }, series: { ...s, status: "complete", winner: "blue", games: [{ ...s.games[0], id: `g${i}`, status: "complete", winner: "blue", actionIndex: 20, bluePicks: [i + 1, null, null, null, null], redPicks: [14, null, null, null, null], blueBans: [3, null, null, null, null], blueRoles: ["top", null, null, null, null], redRoles: ["top", null, null, null, null], recap: { durationMinutes: 30, mvp: null, biggestSwing: null, perPickIds: { blue: t.teams[0].players!.map(p => p.id!), red: t.teams[1].players!.map(p => p.id!) }, ratings: { blue: [9, 7, 7, 7, 7], red: [4, 5, 5, 5, 5] }, laneGoldDiff: { top: 1000 } } }] } });
		t = recordEventCheckpoint(t, `m${i}`);
	}
	return t;
}

test("event rankings retain player and champion filters and expose round evolution", async ({ page }) => {
	const t = eventFixture();
	await page.addInitScript(tournament => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { tournament, season: null } })), t);
	await page.goto("/");
	const panel = page.getByRole("region", { name: "Event UI event statistics" });
	await expect(page.locator('[aria-label="Event UI event statistics"] [aria-label="Role leaders"]')).toHaveCount(0);
	await page.getByRole("button", { name: /^Event Statistics/ }).click();
	const toggle = page.getByRole("button", { name: /^Event Statistics/ });
	await expect(panel.getByRole("columnheader", { name: "Score", exact: true })).toBeVisible();
	await expect(panel.getByRole("columnheader", { name: /Tier/ })).toHaveCount(0);
	await expect(panel.locator('[aria-label="Role leaders"]')).toContainText(t.teams[0].name);
	await expect(panel.locator('td[title="12 games with recorded gold difference"]').first()).toHaveText("1000");
	await expect(panel.locator('td[title="0 games with recorded KDA"]').first()).toHaveText("—");
	await panel.getByLabel("Ranking checkpoint").selectOption({ index: 1 });
	await expect(panel).toContainText("1 games at this checkpoint");
	await expect(panel).toContainText("Provisional · 1/3 rated games");
	await panel.getByLabel("Ranking checkpoint").selectOption("current");
	const pickTable = panel.locator("div").filter({ has: page.getByRole("heading", { name: /Most Picked/ }) }).filter({ has: page.locator("table") }).last();
	await expect(pickTable.locator("tbody tr")).toHaveCount(10);
	await panel.getByLabel("Champion limit").selectOption("all");
	await expect(pickTable.locator("tbody tr")).toHaveCount(13);
	const playerRoles = panel.getByRole("group", { name: "Player role" }), championRoles = panel.getByRole("group", { name: "Champion role" });
	for (const name of ["Top", "Jungle", "Mid", "ADC", "Support"]) await expect(playerRoles.getByRole("button", { name, exact: true })).toBeVisible();
	await expect(panel.locator('[aria-label="Role leaders"]').getByRole("heading", { name: "Mid" })).toBeVisible();
	await expect(panel.locator('[aria-label="Role leaders"] span[title] > .sr-only').first()).toHaveText(/^LCK/);
	await championRoles.getByRole("button", { name: "Mid", exact: true }).click();
	await expect(pickTable).toContainText("No recorded appearances");
	await expect(panel.getByRole("heading", { name: /Most Banned/ })).toBeVisible();
	await playerRoles.getByRole("button", { name: "Mid", exact: true }).click();
	await toggle.focus(); await toggle.press("Enter"); await toggle.press("Enter");
	await expect(playerRoles.getByRole("button", { name: "Mid", exact: true })).toHaveAttribute("aria-pressed", "true");
	await expect(championRoles.getByRole("button", { name: "Mid", exact: true })).toHaveAttribute("aria-pressed", "true");
	await expect(panel.getByLabel("Champion limit")).toHaveValue("all");
	await expect(pickTable).toContainText("No recorded appearances");
	await toggle.click(); await expect(panel).toBeHidden();
	await toggle.click(); await expect(panel).toBeVisible();
	await expect(playerRoles.getByRole("button", { name: "Mid", exact: true })).toHaveAttribute("aria-pressed", "true");
	await expect(panel.getByLabel("Champion limit")).toHaveValue("all");
	await championRoles.getByRole("button", { name: "All", exact: true }).click();
	await panel.screenshot({ path: "test-results/playwright/event-rankings-desktop.png" });
	await page.setViewportSize({ width: 390, height: 844 });
	await panel.scrollIntoViewIfNeeded();
	await page.screenshot({ path: "test-results/playwright/event-rankings-mobile.png" });
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("archived event rankings retain scores, round history and champion statistics", async ({ page }) => {
	const season = makeAuditSeason("Archived event"); const t = eventFixture();
	season.tournaments = { [t.id]: t }; season.phases[0].tournamentIds = [t.id];
	const entry = buildSeasonHistoryEntry(season, 1);
	await page.addInitScript(({ season, entry }) => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { season: null, seasonViewOpen: false, seasonHistory: [], realities: [{ id: "event-archive", name: "Event Archive", year: 2, season, history: [entry] }] } })), { season, entry });
	await page.goto("/");
	await page.getByRole("button", { name: /^Season History/ }).click();
	await page.getByRole("button", { name: /Reality.*Event Archive/ }).click();
	await page.getByRole("button", { name: "Overall", exact: true }).click();
	await page.getByRole("button", { name: "By Season", exact: true }).click();
	const panel = page.getByRole("region", { name: "Archived event statistics" });
	await expect(panel.locator("button", { hasText: "Player Rankings" })).toHaveCount(0);
	await panel.getByRole("button", { name: /^Event statistics/ }).click();
	await panel.getByRole("button", { name: /Player Rankings/ }).first().click();
	await expect(panel.getByLabel("Ranking checkpoint").locator("option")).toHaveCount(13);
	await panel.getByLabel("Ranking checkpoint").selectOption({ index: 1 });
	await expect(panel).toContainText("Provisional · 1/3 rated games");
	await expect(panel.getByRole("heading", { name: /Most Banned/ })).toBeVisible();
	await panel.screenshot({ path: "test-results/playwright/event-rankings-archive.png" });
});
