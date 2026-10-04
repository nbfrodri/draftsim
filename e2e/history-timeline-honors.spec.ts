import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "../lib/season/history";
import { INTERNATIONAL_DISPLAY_ORDER, type TeamRosterSnapshot } from "../lib/season/types";

const team = (name: string): SeasonHistoryTeamRef => ({ name, leagueId: "LCK", iconKey: "shield", color: "#c8aa6e" });
function snapshot(ref: SeasonHistoryTeamRef, id: string, name: string): TeamRosterSnapshot {
  return { teamId: ref.name, teamName: ref.name, leagueId: ref.leagueId,
    coach: { name: `${name} coach`, rating: 80 },
    players: [{ id, name, lane: "top", tier: "S", age: 22 }],
  };
}
function history(): SeasonHistoryEntry[] {
  return [2, 1].map((year) => {
    const winner = team(year === 2 ? "Grand Team" : "Triple Team");
    const runner = team("Finalist Team");
    const entry: SeasonHistoryEntry = { id: `honors-${year}`, name: `Honors Year ${year}`, archivedAt: year,
      complete: true, champion: winner, runnerUp: runner, intlChampions: {}, intlRunnersUp: {},
      splitChampions: { winter: { LCK: winner } }, splitRunnersUp: { winter: { LCK: runner } }, phaseRosters: [],
    };
    for (const event of INTERNATIONAL_DISPLAY_ORDER) {
      const champion = year === 1 && event === "global-cup" ? team("Single Team") : winner;
      const player = champion.name === "Single Team" ? "Single Player" : year === 2 ? "Grand Player" : "Triple Player";
      entry.intlChampions[event] = champion;
      entry.intlRunnersUp![event] = runner;
      entry.phaseRosters!.push({ kind: "international", event, label: event, phaseIndex: entry.phaseRosters!.length,
        teams: [snapshot(champion, player, player), snapshot(runner, `runner-${year}`, `Runner ${event}`)],
      });
    }
    entry.phaseRosters!.push({ kind: "split", split: "winter", label: "Winter", phaseIndex: 5,
      teams: [snapshot(winner, year === 2 ? "Grand Player" : "Triple Player", "Winter Winner"), snapshot(runner, `runner-${year}`, "Runner winter")],
    });
    const careers = new Map<string, NonNullable<SeasonHistoryEntry["playerCareers"]>[number]>();
    for (const phase of entry.phaseRosters!) {
      for (const roster of phase.teams) {
        for (const player of roster.players) {
          if (!player.id || careers.has(player.id)) continue;
          careers.set(player.id, { playerId: player.id, playerName: player.name ?? player.id, leagueId: roster.leagueId,
            teamName: roster.teamName, lane: player.lane, games: 1, kills: 0, mvps: 0, allPro: 0,
            splitTitles: 0, intlTitles: 0, intlAppearances: 1,
          });
        }
      }
    }
    entry.playerCareers = [...careers.values()];
    return entry;
  });
}
async function openHistory(page: Page, archived = history()) {
  await page.addInitScript(({ season, history }) => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7,
    state: { season: null, seasonViewOpen: false, seasonHistory: [], realities: [{ id: "honors", name: "Honors", year: 3, season, history }] },
  })), { season: makeAuditSeason("Honors"), history: archived });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Honors/ }).click();
}

test("overall timeline shows both event rosters and opens the selected year in By Season", async ({ page }) => {
  await openHistory(page);
  // Enable desktop hover cards after browser storage hydration.
  await page.evaluate(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true }));
  await page.getByRole("button", { name: "Overall", exact: true }).click();
  const year = page.getByRole("listitem", { name: "Honors Year 1", exact: true });
  await expect(year).toContainText("Runner msi");
  await expect(year.locator("details")).toHaveCount(0);
  const msi = year.locator(".border").filter({ has: page.getByText("Runner msi", { exact: true }) });
  await expect(msi).toContainText("Runner msi coach");
  await msi.getByRole("button", { name: "Finalist Team LCK", exact: true }).hover();
  const card = page.getByRole("tooltip");
  await expect(card).toContainText("Runner msi");
  await expect(card).toContainText("Honors Year 1 · msi");
  await expect(card).not.toContainText("Runner worlds");
  await page.mouse.move(0, 0);
  await expect(card).toBeHidden();
  await msi.getByRole("button", { name: "Runner msi coach", exact: true }).hover();
  await expect(card).toContainText("Runner msi coach");
  await expect(card).toContainText("Finalist Team");
  await expect(card).toContainText("Honors Year 1 · msi");
  await page.mouse.move(0, 0);
  await expect(card).toBeHidden();
  await page.evaluate(() => Reflect.deleteProperty(window, "__TAURI_INTERNALS__"));
  await page.getByRole("button", { name: "LCK", exact: true }).click();
  await expect(year).toContainText("Runner winter");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: "test-results/playwright/overall-finalists.png" });
  await year.getByRole("button", { name: "View Honors Year 1 in timeline", exact: true }).click();
  await expect(year).toHaveCount(0);
  await expect(page.getByRole("button", { name: "By Season", exact: true })).toHaveAttribute("aria-busy", "false");
  await expect(page.getByText("Honors Year 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Single Team LCK", exact: true }).first()).toBeVisible();
});

test("players and teams show distinct international honors and support AND event filters", async ({ page }) => {
  await openHistory(page);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("img", { name: "International Grand Slam", exact: true })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "International Triple Crown", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: /Grand Player/ }).first().click();
  await expect(page.getByRole("img", { name: "International Grand Slam", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Intl titles", exact: true }).click();
  const filters = page.getByRole("group", { name: "International title filters", exact: true });
  await filters.getByRole("button", { name: "Match all (AND)", exact: true }).click();
  await expect(page.getByRole("button", { name: /Triple Player/ })).toHaveCount(0);
  await filters.getByRole("button", { name: "Global Cup", exact: true }).click();
  await expect(page.getByRole("button", { name: /Triple Player/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Single Player/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await expect(page.getByRole("img", { name: "International Grand Slam", exact: true })).toHaveCount(1);
  await expect(page.getByRole("img", { name: "International Triple Crown", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: /Grand Team/ }).first().click();
  await expect(page.getByRole("img", { name: "International Grand Slam", exact: true })).toHaveCount(2);
  await filters.getByRole("button", { name: "Global Cup", exact: true }).click();
  await expect(page.getByRole("button", { name: /Triple Team/ })).toHaveCount(0);
  await filters.getByRole("button", { name: "Match any (OR)", exact: true }).click();
  await expect(page.getByRole("button", { name: /Triple Team/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Single Team/ })).toHaveCount(1);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: "test-results/playwright/international-honors.png" });
});

test("player profiles show the same international appearance breakdown and event logos as teams", async ({ page }) => {
  const archived = history();
  const latest = archived[0];
  latest.playerCareers!.find(player => player.playerId === "Grand Player")!.intlAppearances = 4;
  await openHistory(page, archived);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Grand Player/ }).first().click();
  const appearances = page.getByRole("group", { name: "International Appearances", exact: true });
  await expect(appearances).toContainText("Total: 4");
  for (const event of ["First Stand", "MSI", "Worlds", "Global Cup"]) {
    await expect(appearances).toContainText(`${event}×1`);
  }
  for (const event of ["first-stand", "msi", "worlds"]) {
    await expect(appearances.locator(`img[src="/league-logos/${event}.png"]`)).toBeVisible();
  }
  await expect(appearances.locator("svg")).toHaveCount(1);
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await appearances.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await appearances.locator("..").screenshot({ path: `test-results/player-international-appearances/player-profile-${width}.png` });
  }
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: /Grand Team/ }).first().click();
  await expect(appearances).toContainText("Total: 4");
});

test("legacy player appearances retain the aggregate total without inventing event counts", async ({ page }) => {
  const archived = history();
  const latest = archived[0];
  latest.playerCareers!.find(player => player.playerId === "Grand Player")!.intlAppearances = 4;
  latest.phaseRosters = latest.phaseRosters!.filter(phase => phase.kind === "split" || phase.event === "worlds");
  await openHistory(page, archived);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Grand Player/ }).first().click();
  const appearances = page.getByRole("group", { name: "International Appearances", exact: true });
  await expect(appearances).toContainText("Recorded: 1");
  await expect(appearances).toContainText("Worlds×1");
  await expect(appearances).not.toContainText("MSI");
  await expect(page.getByText(/International appearance breakdown is incomplete/)).toBeVisible();
  await expect(page.getByText("Intl Appearances", { exact: true }).locator("..")).toContainText("4");
});
