import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createTournament, recordMatchWinner } from "../lib/tournament";
import { resolveTeamLogo } from "../lib/season/realTeams";

const defaults = { format: "bo1", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false } as const;
async function seed(page: Page, state: unknown) {
	await page.addInitScript(value => {
		if (!localStorage.getItem("draftsim-store")) localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: value }));
	}, state);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
}

test("MSI pre-qualified teams show logos and retain focus cards", async ({ page }) => {
	const s = makeAuditSeason();
	const teams = s.teams.slice(0, 10).map((t, i) => ({ ...t, seed: i + 1, name: i === 0 ? "T1" : t.name, logoUrl: i === 0 ? resolveTeamLogo("T1") : undefined }));
	const t = createTournament({ name: "MSI", format: "swiss-playoffs-de", teams, defaults, swissByeTeamIds: teams.slice(0, 2).map(t => t.id) });
	await seed(page, { tournament: null, savedTournaments: [{ id: t.id, savedAt: 1, tournament: t, preTournamentMetaSnapshot: null, playerForms: {} }] });
	await expect(page.getByRole("button", { name: /MSI/ })).toBeVisible();
	await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
	await page.getByRole("button", { name: /MSI/ }).click();
	const qualified = page.getByText("Pre-Qualified to Playoffs", { exact: true }).locator("../..");
	await expect(qualified.locator("img").first()).toHaveAttribute("src", /t1/i);
	const trigger = qualified.getByLabel("T1", { exact: true });
	await trigger.hover();
	await expect(page.getByRole("tooltip")).toContainText("T1");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("tooltip")).toHaveCount(0);
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.screenshot({ path: "test-results/playwright/ss-msi-logos.png", fullPage: true });
});

test("recap team chips open the existing cards with mouse and keyboard", async ({ page }) => {
	const season = makeAuditSeason("SS recap");
	season.teams[0].name = "T1";
	season.teams[0].logoUrl = resolveTeamLogo("T1");
	const teams = season.teams.slice(0, 2).map((t, i) => ({ ...t, seed: i + 1 }));
	let t = createTournament({ name: "Winter final", format: "single-elim", teams, defaults });
	t = recordMatchWinner(t, t.matches[0].id, { teamId: teams[0].id, blueWins: 1, redWins: 0 });
	season.tournaments = { [t.id]: t };
	season.phases = [{ kind: "split", split: "winter", label: "Winter", status: "complete", tournamentIds: [t.id] }];
	season.phaseIndex = 0;
	season.status = "complete";
	season.splitResults = { winter: { LCK: [teams[0].id, teams[1].id] } };
	season.teams[0].players[0] = { ...season.teams[0].players[0], tier: "SS", ss: { baseTier: "S+", lane: "top", seasonId: season.id, phaseIndex: 0, phaseLabel: "Winter", score: 7.4, games: 16 } };
	await seed(page, { season, seasonViewOpen: false });
	await expect(page.getByRole("region", { name: "Continue playing" })).toBeVisible();
	await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
	await page.getByRole("region", { name: "Continue playing" }).getByRole("button").click();
	for (const label of ["Winningest Team", "Most Titles"]) {
		const chip = page.getByText(label, { exact: true }).locator("..");
		const name = chip.getByLabel("T1", { exact: true });
		await name.focus();
		await expect(page.getByRole("tooltip")).toContainText("T1");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("tooltip")).toHaveCount(0);
		await name.blur();
		await page.mouse.move(0, 0);
		await name.hover();
		await expect(page.getByRole("tooltip")).toContainText("T1");
		await page.keyboard.press("Escape");
		await expect(page.getByRole("tooltip")).toHaveCount(0);
	}
	await page.getByRole("button", { name: /Browse Leagues & Rosters/ }).click();
	await page.getByRole("button", { name: /^T1 .*★/ }).click();
	const holder = season.teams[0].players[0];
	const holderName = page.getByText(holder.name!, { exact: true }).first();
	await holderName.hover();
	const playerCard = page.getByRole("tooltip").filter({ hasText: "Development tier S+" });
	await expect(playerCard).toContainText("16 rated games");
	await expect(playerCard).toContainText("score 7.40");
	await playerCard.screenshot({ path: "test-results/playwright/ss-player-evidence.png" });
	await page.keyboard.press("Escape");
	await expect(playerCard).toHaveCount(0);
	await expect(holderName).toBeVisible();
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.getByText("Winningest Team", { exact: true }).scrollIntoViewIfNeeded();
	await page.screenshot({ path: "test-results/playwright/ss-recap-team-cards.png" });
	await page.evaluate(() => Reflect.deleteProperty(window, "__TAURI_INTERNALS__"));
	await page.reload();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem("draftsim-store")!).state.season.teams[0].players[0].ss.baseTier)).toBe("S+");
});
