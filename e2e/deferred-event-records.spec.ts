import { expect, test } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import { createSeries } from "../lib/series";
import { recordEventCheckpoint } from "../lib/eventStats";
import { buildEventRecord } from "../lib/season/eventHistory";
import type { SeasonHistoryEntry } from "../lib/season/history";

function eventRecord() {
	let t = structuredClone(Object.values(makeAuditSeason("Deferred event").tournaments)[0]);
	t.teams = t.teams.slice(0, 2);
	const template = t.matches[0]; t.matches = [];
	for (let i = 0; i < 3; i++) {
		const s = createSeries({ format: "bo1", mode: "aivai", aiDifficulty: "normal", aiSide: null, fearless: false, timerEnabled: false, blueTeam: t.teams[0].name, redTeam: t.teams[1].name });
		t.matches.push({ ...template, id: `m${i}`, round: i + 1, feedsInto: null, blueTeamId: t.teams[0].id, redTeamId: t.teams[1].id, winner: { teamId: t.teams[0].id, blueWins: 1, redWins: 0 }, series: { ...s, status: "complete", winner: "blue", games: [{ ...s.games[0], id: `g${i}`, status: "complete", winner: "blue", actionIndex: 20, bluePicks: [1, null, null, null, null], redPicks: [2, null, null, null, null], blueRoles: ["top", null, null, null, null], redRoles: ["top", null, null, null, null], recap: { durationMinutes: 30, mvp: null, biggestSwing: null, perPickIds: { blue: t.teams[0].players!.map(p => p.id!), red: t.teams[1].players!.map(p => p.id!) }, ratings: { blue: [9, 7, 7, 7, 7], red: [4, 5, 5, 5, 5] } } }] } });
		t = recordEventCheckpoint(t, `m${i}`);
	}
	return buildEventRecord([t], { id: "y1:0:LCK", label: "LCK · Winter Split", split: "winter", leagueId: "LCK", phaseIndex: 0 });
}

test("a dormant year's event statistics load on demand from storage and can be retried", async ({ page }) => {
	const active = makeAuditSeason("Deferred A");
	const dormant = makeAuditSeason("Deferred B");
	const year: SeasonHistoryEntry = { id: "b-year-1", name: "Deferred B Year 1", archivedAt: 1, complete: true, champion: null, runnerUp: null, intlChampions: {}, splitChampions: {}, franchiseYear: 1 };
	const records = [eventRecord()];
	await page.addInitScript(state => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state })), {
		season: active, seasonViewOpen: false, activeRealityId: active.franchise!.id,
		realities: [{ id: active.franchise!.id, name: "Deferred A", year: 1, season: active, history: [] }, { id: dormant.franchise!.id, name: "Deferred B", year: 2, season: dormant, history: [] }],
	});
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	await page.getByRole("button", { name: /^Season History/ }).click();
	// Simulate a storage v9 desktop database: the year row has no records; they live apart.
	await page.evaluate(({ year, records }) => {
		let failRecords = true;
		const row = JSON.stringify(year), recordsJson = JSON.stringify(records);
		const part = (text: string, values: unknown[]) => { const [start, length] = values as [number, number]; return [{ part: text.slice(start - 1, start - 1 + length) }]; };
		Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {
			invoke: async (command: string, args: { query?: string; path?: string; values?: unknown[] } = {}) => {
				if (command === "plugin:path|resolve_directory") return "fixture";
				if (command === "plugin:path|join") return "fixture/draftsim.db";
				if (command === "plugin:sql|load") return args.path;
				if (command === "plugin:sql|execute") return [0, 0];
				if (command !== "plugin:sql|select") return null;
				const q = args.query ?? "";
				if (q.includes("persist_version")) return [{ value: "9" }];
				if (q.includes("substr(entry_json, 1, 6)")) return [];
				if (q.includes("LENGTH(entry_json)")) return [{ entry_id: year.id, sort_order: 0, chars: row.length }];
				if (q.includes("substr(entry_json")) return part(row, args.values!);
				if (q.includes("record_count FROM reality_event_records")) return [{ entry_id: year.id, record_count: records.length }];
				if (q.includes("LENGTH(records_json)")) return [{ chars: recordsJson.length }];
				if (q.includes("substr(records_json")) {
					if (failRecords) { failRecords = false; throw new Error("disk busy"); }
					return part(recordsJson, args.values!);
				}
				return [];
			},
		} });
	}, { year, records });
	await page.getByRole("button", { name: "Timeline", exact: true }).click();
	await page.getByRole("button", { name: /Reality.*Deferred B$/ }).click();
	await expect(page.getByText("Deferred B Year 1", { exact: true }).first()).toBeVisible();
	const section = page.getByRole("region", { name: "Archived event statistics" }).first();
	// The count is known without loading, so the year never reads as "Not recorded".
	await expect(section.getByRole("button", { name: /Event Statistics/ })).toContainText("1 event");
	await section.getByRole("button", { name: /Event Statistics/ }).click();
	await expect(section.getByRole("alert")).toContainText("Could not load event statistics.");
	await section.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(section).toContainText("LCK · Winter Split");
	await expect(section).not.toContainText("not recorded");
	await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
});
