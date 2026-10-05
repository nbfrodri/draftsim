import { expect, test, type Page } from "@playwright/test";
import { makeAuditSeason } from "../lib/auditFixtures";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "../lib/season/history";
import type { InternationalId, SplitId, TeamRosterSnapshot } from "../lib/season/types";
import { resolveTeamLogo } from "../lib/season/realTeams";

const t1: SeasonHistoryTeamRef = { name: "T1", leagueId: "LCK", logoUrl: resolveTeamLogo("T1"), color: "#e84057", iconKey: "sword" };
const rival: SeasonHistoryTeamRef = { name: "Gen.G Esports", leagueId: "LCK", logoUrl: resolveTeamLogo("Gen.G Esports"), color: "#c8aa6e", iconKey: "shield" };
const calendar = ["winter", "first-stand", "spring", "msi", "summer", "worlds", "global-cup"] as const;
function roster(team: SeasonHistoryTeamRef, academy = false): TeamRosterSnapshot {
  return { teamId: team.name, teamName: team.name, leagueId: team.leagueId, logoUrl: team.logoUrl,
    coach: { name: "Fixture Coach", rating: 4 },
    players: (["top", "jungle", "middle", "bottom", "support"] as const).map((lane, index) => ({
      id: team === t1 ? (index === 2 ? academy ? "replacement" : "atlas" : `peer-${index}`) : `rival-${index}`,
      name: team === t1 ? (index === 2 ? academy ? "Replacement" : "Atlas" : index === 0 ? "Nova" : ["", "Scout", "", "Arrow", "Guard"][index]) : `Rival ${lane}`,
      lane, tier: "S", age: 21,
    })),
  };
}
function history(): SeasonHistoryEntry[] {
  return Array.from({ length: 8 }, (_, index) => {
    const year = index + 1;
    const entry: SeasonHistoryEntry = { id: `focus-${year}`, name: `Career Year ${year}`, archivedAt: year, complete: true,
      champion: t1, runnerUp: rival, intlChampions: {}, intlRunnersUp: {}, intlPlacements: {},
      splitChampions: {}, splitRunnersUp: {}, splitPlacements: {}, phaseRosters: [],
      playerCareers: [{ playerId: "atlas", playerName: "Atlas", leagueId: "LCK", teamName: "T1", lane: "middle",
        games: 100, kills: 200, mvps: 2, allPro: 0, intlTitles: 0, splitTitles: 0, intlAppearances: 1 },
        { playerId: "peer-0", playerName: "Nova", leagueId: "LCK", teamName: "T1", lane: "top",
          games: 100, kills: 100, mvps: 1, allPro: 0, intlTitles: 0, splitTitles: 0, intlAppearances: 1 }],
    };
    if (year === 1) {
      entry.inactivePlayers = [{ playerId: "atlas", playerName: "Atlas", lane: "middle", tier: "S", status: "academy",
        inactiveYears: 1, demotedYear: 1, lastTeamId: "T1", lastTeamName: "T1" }];
      entry.playerCareers![0].intlAppearances = 0;
      return entry; // Imported legacy year with year-end status but no event snapshots.
    }
    for (const event of calendar) {
      if (event === "global-cup" && year % 2) continue;
      const isSplit = ["winter", "spring", "summer"].includes(event);
      const academy = year === 6 && (event === "msi" || event === "worlds");
      const dnq = year === 5 && event === "msi";
      if (isSplit) {
        entry.splitChampions[event as SplitId] = { LCK: t1 };
        entry.splitPlacements![event as SplitId] = { LCK: [t1, rival] };
      } else {
        entry.intlChampions[event as InternationalId] = dnq ? rival : t1;
        entry.intlPlacements![event as InternationalId] = dnq ? [rival] : [t1, rival];
      }
      entry.phaseRosters!.push({ phaseIndex: entry.phaseRosters!.length, label: event,
        ...(isSplit ? { kind: "split", split: event as SplitId } : { kind: "international", event: event as InternationalId }),
        teams: [roster(t1, academy), roster(rival)],
        inactive: academy ? [{ playerId: "atlas", status: "academy", teamId: "T1", teamName: "T1" }] : [],
      });
    }
    return entry;
  });
}
async function openProfile(page: Page) {
  await page.addInitScript(({ season, history }) => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7,
    state: { season: null, seasonViewOpen: false, seasonHistory: [], realities: [{ id: "focus", name: "Focus", year: 9, season, history }] },
  })), { season: makeAuditSeason("Focus"), history: history() });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Focus/ }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Atlas/ }).first().click();
  return page.getByRole("region", { name: "Career History", exact: true });
}

test("career event icons and highlights span all visible years, including DNQ and academy checkpoints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const career = await openProfile(page);
  const controls = career.getByRole("group", { name: "Highlight career events", exact: true });
  await expect(career.getByRole("group", { name: /career history$/ })).toHaveCount(8);
  await expect(career.getByText("Event history was not recorded for this season.")).toBeVisible();
  await expect(career.locator('[data-career-event="msi"] img[src="/league-logos/msi.png"]')).toHaveCount(7);
  await expect(career.locator('[data-career-event="spring"] svg.tabler-icon-flower')).toHaveCount(7);
  await controls.getByRole("button", { name: "MSI", exact: true }).click();
  await controls.getByRole("button", { name: "Spring Split", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(controls.getByRole("button", { name: "Spring Split", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(career.getByRole("status")).toContainText("14 highlighted events in 8 seasons");
  await expect(career.locator('[data-highlighted="true"]')).toHaveCount(14);
  await expect(career.locator('[data-career-event="worlds"]')).toHaveCount(7);
  const dnq = career.getByRole("group", { name: "Career Year 5 career history", exact: true }).locator('[data-career-event="msi"]');
  await expect(dnq).toContainText("Didn't qualify");
  await expect(dnq).toHaveAttribute("data-highlighted", "true");
  expect(await dnq.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
  const academy = career.getByRole("group", { name: "Career Year 6 career history", exact: true }).locator('[data-career-event="msi"]');
  await expect(academy).toContainText("ACY");
  await expect(academy).toHaveAttribute("data-highlighted", "true");
  await career.screenshot({ path: "test-results/career-history-focus/all-years-1440.png" });

  // Highlighting must preserve opening the exact archived roster.
  const event = career.getByRole("group", { name: "Career Year 4 career history", exact: true }).locator('[data-career-event="msi"]');
  await event.click();
  await expect(event.locator("..")).toHaveAttribute("open", "");
  await expect(event.locator("..")).toContainText("Atlas");
  await controls.getByRole("button", { name: "MSI", exact: true }).click();
  await expect(event.locator("..")).toHaveAttribute("open", "");
  await controls.getByRole("button", { name: "Clear highlights", exact: true }).click();
  await expect(career.locator('[data-highlighted="true"]')).toHaveCount(0);
  await expect(career.getByRole("group", { name: /career history$/ })).toHaveCount(8);
});

test("career season ranges are inclusive, stay valid when crossed and reset on another player", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const career = await openProfile(page);
  const controls = career.getByRole("group", { name: "Highlight career events", exact: true });
  await controls.getByRole("button", { name: "Worlds", exact: true }).click();
  await controls.getByRole("button", { name: "Global Cup", exact: true }).click();
  await career.getByLabel("From season", { exact: true }).selectOption("focus-3");
  await career.getByLabel("To season", { exact: true }).selectOption("focus-6");
  await expect(career.getByRole("group", { name: /career history$/ })).toHaveCount(4);
  await expect(career.getByRole("status")).toContainText("6 highlighted events in 4 seasons");
  await expect(career.locator('[data-career-event="winter"]')).toHaveCount(4);
  expect(await career.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await career.screenshot({ path: "test-results/career-history-focus/year-range-1024.png" });
  await career.getByLabel("From season", { exact: true }).selectOption("focus-7");
  await expect(career.getByLabel("To season", { exact: true })).toHaveValue("focus-7");
  await expect(career.getByRole("group", { name: /career history$/ })).toHaveCount(1);
  await career.getByLabel("To season", { exact: true }).selectOption("focus-2");
  await expect(career.getByLabel("From season", { exact: true })).toHaveValue("focus-2");
  await career.getByLabel("To season", { exact: true }).selectOption("focus-1");
  await expect(career.getByRole("status")).toContainText("0 highlighted events in 1 season");
  await expect(career.locator('[data-highlighted="true"]')).toHaveCount(0);
  await career.getByRole("button", { name: "All seasons", exact: true }).click();
  await expect(career.getByRole("group", { name: /career history$/ })).toHaveCount(8);
  await expect(controls.getByRole("button", { name: "Worlds", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByPlaceholder(/Search by player/).locator("..").getByRole("button", { name: /Nova/ }).first().click();
  await expect(career.locator('[data-highlighted="true"]')).toHaveCount(0);
  await expect(career.getByLabel("From season", { exact: true })).toHaveValue("");
  await expect(career.getByLabel("To season", { exact: true })).toHaveValue("");
});
