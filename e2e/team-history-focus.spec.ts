import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "../lib/season/history";
import type { InternationalId, SplitId, TeamRosterSnapshot } from "../lib/season/types";

const team: SeasonHistoryTeamRef = { name: "Focus Team", leagueId: "LCK", color: "#e84057", iconKey: "sword" };
const rival: SeasonHistoryTeamRef = { name: "Other Team", leagueId: "LCK", color: "#c8aa6e", iconKey: "shield" };
const calendar = ["winter", "first-stand", "spring", "msi", "summer", "worlds", "global-cup"] as const;
function roster(ref: SeasonHistoryTeamRef, year: number): TeamRosterSnapshot {
  return { teamId: ref.name, teamName: ref.name, leagueId: ref.leagueId,
    coach: { name: `${ref.name} Coach ${year}`, rating: 4 },
    players: (["top", "jungle", "middle", "bottom", "support"] as const).map(lane => ({
      id: `${ref.name}-${lane}`, name: `${ref.name} ${lane} Year ${year}`, lane, tier: "S", age: 21,
    })),
  };
}
function history(): SeasonHistoryEntry[] {
  return Array.from({ length: 4 }, (_, index) => {
    const year = index + 1;
    const entry: SeasonHistoryEntry = { id: `team-focus-${year}`, name: `Team Year ${year}`, archivedAt: year, complete: true,
      champion: null, runnerUp: null, intlChampions: {}, intlRunnersUp: {}, intlPlacements: {},
      splitChampions: {}, splitRunnersUp: {}, splitPlacements: {}, phaseRosters: [],
    };
    if (year === 1) {
      entry.champion = team;
      entry.runnerUp = rival;
      return entry; // Legacy Worlds result, without event placements or rosters.
    }
    for (const event of calendar) {
      if (year === 4 && event !== "winter") continue;
      if (year === 3 && event === "global-cup") continue;
      const split = ["winter", "spring", "summer"].includes(event);
      if (year !== 4) {
        if (split) {
          entry.splitChampions[event as SplitId] = { LCK: rival };
          entry.splitPlacements![event as SplitId] = { LCK: [rival, team] };
        } else {
          entry.intlChampions[event as InternationalId] = rival;
          entry.intlPlacements![event as InternationalId] = year === 2 && event === "msi" ? [rival] : [rival, team];
        }
      }
      entry.phaseRosters!.push({ phaseIndex: entry.phaseRosters!.length, label: event,
        ...(split ? { kind: "split", split: event as SplitId } : { kind: "international", event: event as InternationalId }),
        teams: [roster(team, year), roster(rival, year)],
      });
    }
    return entry;
  });
}
async function openTeam(page: Page) {
  await page.addInitScript(({ season, history }) => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7,
    state: { season: null, seasonViewOpen: false, seasonHistory: [], realities: [{ id: "team-focus", name: "Team Focus", year: 5, season, history }] },
  })), { season: makeAuditSeason("Team Focus"), history: history() });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Team Focus/ }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Teams", exact: true }).click();
  await page.getByRole("button", { name: /Focus Team/ }).first().click();
  return page.getByRole("region", { name: "Results History", exact: true });
}

test("team event highlights preserve DNQ, legacy results and exact historical rosters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const results = await openTeam(page);
  const controls = results.getByRole("group", { name: "Highlight career events", exact: true });
  const appearances = page.getByRole("group", { name: "International Appearances", exact: true });
  const appearancesBefore = await appearances.textContent();
  await expect(results.getByRole("group", { name: /results history$/ })).toHaveCount(4);
  await expect(results.getByText("No recorded results", { exact: true })).toBeVisible();
  await controls.getByRole("button", { name: "MSI", exact: true }).click();
  await controls.getByRole("button", { name: "Spring Split", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(results.getByRole("status")).toContainText("4 highlighted events in 4 seasons");
  await expect(results.locator('[data-highlighted="true"]')).toHaveCount(4);
  await expect(results.locator('[data-career-event="worlds"]')).toHaveCount(3);
  await expect(results.locator('[data-career-event="msi"] img[src="/league-logos/msi.png"]')).toHaveCount(2);
  await expect(results.locator('[data-career-event="spring"] svg.tabler-icon-flower')).toHaveCount(2);
  const year2 = results.getByRole("group", { name: "Team Year 2 results history", exact: true });
  const dnq = year2.locator('[data-career-event="msi"]');
  await expect(dnq).toContainText("Didn't qualify");
  await expect(dnq).toHaveAttribute("data-highlighted", "true");
  expect(await dnq.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
  const spring = year2.locator('[data-career-event="spring"]');
  await spring.click();
  await expect(spring.locator("..")).toContainText("Focus Team middle Year 2");
  await controls.getByRole("button", { name: "Spring Split", exact: true }).click();
  await expect(spring.locator("..")).toHaveAttribute("open", "");
  await controls.getByRole("button", { name: "Clear highlights", exact: true }).click();
  await controls.getByRole("button", { name: "Worlds", exact: true }).click();
  await expect(results.getByRole("status")).toContainText("3 highlighted events in 4 seasons");
  const legacy = results.getByRole("group", { name: "Team Year 1 results history", exact: true }).locator('[data-career-event="worlds"]');
  await expect(legacy).toContainText("#1");
  await expect(legacy).toHaveAttribute("data-highlighted", "true");
  await legacy.click();
  await expect(legacy.locator("..")).toContainText("No roster snapshot was recorded for this event.");
  await expect(appearances).toHaveText(appearancesBefore!);
});

test("team year ranges are inclusive, preserve roster navigation and reset for another team", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const results = await openTeam(page);
  const controls = results.getByRole("group", { name: "Highlight career events", exact: true });
  await controls.getByRole("button", { name: "Worlds", exact: true }).click();
  await controls.getByRole("button", { name: "Global Cup", exact: true }).click();
  await results.getByLabel("From season", { exact: true }).selectOption("team-focus-2");
  await results.getByLabel("To season", { exact: true }).selectOption("team-focus-3");
  await expect(results.getByRole("group", { name: /results history$/ })).toHaveCount(2);
  await expect(results.getByRole("status")).toContainText("3 highlighted events in 2 seasons");
  expect(await results.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await results.getByRole("button", { name: "View Team Year 2 in stage rosters", exact: true }).click();
  await expect(page.getByRole("button", { name: /^S Focus Team middle Year 2 / })).toBeVisible();
  await expect(results.getByRole("group", { name: /results history$/ })).toHaveCount(2);
  await results.getByLabel("From season", { exact: true }).selectOption("team-focus-4");
  await expect(results.getByLabel("To season", { exact: true })).toHaveValue("team-focus-4");
  await expect(results.getByRole("status")).toContainText("0 highlighted events in 1 season");
  await expect(results.getByText("No recorded results", { exact: true })).toBeVisible();
  await results.getByLabel("To season", { exact: true }).selectOption("team-focus-1");
  await expect(results.getByLabel("From season", { exact: true })).toHaveValue("team-focus-1");
  await expect(results.getByRole("status")).toContainText("1 highlighted event in 1 season");
  await results.getByRole("button", { name: "All seasons", exact: true }).click();
  await expect(results.getByRole("group", { name: /results history$/ })).toHaveCount(4);
  await expect(controls.getByRole("button", { name: "Global Cup", exact: true })).toHaveAttribute("aria-pressed", "true");
  await results.getByLabel("From season", { exact: true }).selectOption("team-focus-2");
  await page.getByPlaceholder(/Search by team/).locator("../..").getByRole("button", { name: /Other Team/ }).first().click();
  await expect(results.getByLabel("From season", { exact: true })).toHaveValue("");
  await expect(results.getByLabel("To season", { exact: true })).toHaveValue("");
  await expect(results.locator('[data-highlighted="true"]')).toHaveCount(0);
  await expect(results.getByRole("group", { name: /results history$/ })).toHaveCount(4);
});
