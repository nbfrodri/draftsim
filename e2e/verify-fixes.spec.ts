import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createTournament, recordMatchWinner } from "../lib/tournament";
import { createSeries } from "../lib/series";
import { rosterFromStar } from "../lib/players";
import { makeAuditSeason } from "../lib/auditFixtures";
import { resolveTeamLogo } from "../lib/season/realTeams";
import type { SeasonHistoryEntry, SeasonHistoryTeamRef } from "../lib/season/history";
import type { InternationalId, SplitId, TeamRosterSnapshot } from "../lib/season/types";

const SHOTS = "test-results/verify-fixes";
const lanes = ["top", "jungle", "middle", "bottom", "support"] as const;

async function seed(page: Page, state: unknown) {
  await page.addInitScript(state => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state })), state);
  await page.emulateMedia({ reducedMotion: "reduce" });
}

// ── 1. Role gaps in the match replay ────────────────────────────────────────
// Game 1: Team 1 (blue) mid 9.1 vs 5.4 → Mid Gap +3.7.
// Game 2: sides swap; Team 2 (blue) jungle 8.8 vs 6.0 → Jungle Gap +2.8, Team 1 mid 8.0 vs 6.0 → Mid Gap +2.0.
// Series averages: mid 8.6 vs 5.7 → Mid Gap +2.9; jungle 6.5 vs 7.9 stays under the threshold.
function replayTournament() {
  let t = createTournament({ name: "Gap Cup", format: "single-elim", teams: Array.from({ length: 2 }, (_, i) => ({
    id: `gap-${i}`, name: `Gap Team ${i + 1}`, seed: i + 1, leagueId: i ? "LPL" as const : "LCK" as const,
    logoUrl: `/league-logos/${i ? "LPL" : "LCK"}.png`,
    players: rosterFromStar(4).map((p, n) => ({ ...p, id: `gp-${i}-${n}`, name: `G${i + 1} ${lanes[n]}` })) as ReturnType<typeof rosterFromStar>,
  })), defaults: { format: "bo3", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false } });
  const m = t.matches.find(row => row.blueTeamId && row.redTeamId)!;
  const a = t.teams.find(team => team.id === m.blueTeamId)!;
  const b = t.teams.find(team => team.id === m.redTeamId)!;
  const ratings = [
    { blue: [7, 7, 9.1, 7, 7], red: [7, 7, 5.4, 7, 7] },
    { blue: [7, 8.8, 6, 7, 7], red: [7, 6, 8, 7, 7] },
  ];
  const series = createSeries({ ...t.defaults, blueTeam: a.name, redTeam: b.name });
  series.games = [0, 1].map(n => {
    const blue = n === 0 ? a : b, red = n === 0 ? b : a;
    return { ...series.games[0], id: `gap-game-${n}`, gameNumber: n + 1, status: "complete" as const,
      blueTeam: blue.name, redTeam: red.name, winner: n === 0 ? "blue" as const : "red" as const,
      bluePicks: [266, 103, 84, 22, 12], redPicks: [1, 2, 3, 4, 5], blueRoles: [...lanes], redRoles: [...lanes],
      recap: { durationMinutes: 30, mvp: null, biggestSwing: null, ratings: ratings[n],
        perPickKDA: { blue: lanes.map(() => ({ k: 3, d: 2, a: 5 })), red: lanes.map(() => ({ k: 2, d: 3, a: 4 })) },
        perPickNames: { blue: blue.players!.map(p => p.name!), red: red.players!.map(p => p.name!) },
        perPickIds: { blue: blue.players!.map(p => p.id!), red: red.players!.map(p => p.id!) },
      },
    };
  });
  series.status = "complete";
  t = { ...t, matches: t.matches.map(row => row.id === m.id ? { ...row, series } : row) };
  return recordMatchWinner(t, m.id, { teamId: a.id, blueWins: 2, redWins: 0 });
}

test("1 · match replay shows series and per-game role gaps", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page, { tournament: replayTournament(), season: null });
  await page.goto("/");
  await page.getByRole("article", { name: "Fastest", exact: true }).getByRole("button").click();
  const series = page.getByRole("group", { name: "Series role gaps", exact: true });
  await expect(series).toContainText("Mid Gap");
  await expect(series).toContainText("+2.9");
  await expect(series).toContainText("G1 middle");
  await expect(series).not.toContainText("Gap Team 1");
  await expect(series).not.toContainText("Jungle Gap");
  await series.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/1-role-gap-series-game1.png` });
  const game = page.getByRole("group", { name: "Game role gaps", exact: true });
  await expect(game).toContainText("Mid Gap");
  await expect(game).toContainText("+3.7");
  await expect(game).toContainText("G1 middle");
  await game.screenshot({ path: `${SHOTS}/1-role-gap-game1-detail.png` });
  await page.getByRole("button", { name: /^Game 2, won by/ }).click();
  await expect(game).toContainText("Jungle Gap");
  await expect(game).toContainText("+2.8");
  await expect(game).toContainText("+2.0");
  await expect(game).toContainText("G2 jungle");
  await expect(game).toContainText("G1 middle");
  // Logo sits on the chip's vertical centre.
  for (const chip of await game.locator(":scope > span").all()) {
    const box = (await chip.boundingBox())!;
    const logo = (await chip.locator("span.h-4 img").first().boundingBox())!;
    expect(Math.abs(logo.y + logo.height / 2 - (box.y + box.height / 2))).toBeLessThanOrEqual(1.5);
  }
  await game.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/1-role-gap-game2.png` });
});

// ── 2. Career history: academy logos per window, FA year without a club ────
const t1: SeasonHistoryTeamRef = { name: "T1", leagueId: "LCK", logoUrl: resolveTeamLogo("T1"), color: "#e84057", iconKey: "sword" };
const rival: SeasonHistoryTeamRef = { name: "Gen.G Esports", leagueId: "LCK", logoUrl: resolveTeamLogo("Gen.G Esports"), color: "#c8aa6e", iconKey: "shield" };
const calendar = ["winter", "first-stand", "spring", "msi", "summer", "worlds"] as const;
function roster(team: SeasonHistoryTeamRef, withAtlas: boolean): TeamRosterSnapshot {
  return { teamId: team.name, teamName: team.name, leagueId: team.leagueId, logoUrl: team.logoUrl, coach: { name: "Coach", rating: 4 },
    players: lanes.map((lane, i) => ({ id: team === t1 && i === 2 && withAtlas ? "atlas" : `${team.name}-${i}`,
      name: team === t1 && i === 2 && withAtlas ? "Atlas" : `${team.name} ${lane}`, lane, tier: "S" as const, age: 21 })) };
}
// Year 1: T1 starter. Year 2: T1 academy all year. Year 3: free agent all year.
// Year 4: free agent all year, retires at year end.
function careerHistory(): SeasonHistoryEntry[] {
  const status = [null, "academy", "free-agent", "free-agent"] as const;
  const yearEnd = [null, "academy", "free-agent", "retired"] as const;
  return status.map((st, index) => {
    const year = index + 1;
    const entry: SeasonHistoryEntry = { id: `vf-${year}`, name: `Verify Year ${year}`, archivedAt: year, complete: true,
      champion: t1, runnerUp: rival, intlChampions: {}, intlRunnersUp: {}, intlPlacements: {},
      splitChampions: {}, splitRunnersUp: {}, splitPlacements: {}, phaseRosters: [],
      playerCareers: [{ playerId: "atlas", playerName: "Atlas", leagueId: "LCK", teamName: "T1", lane: "middle",
        games: st ? 0 : 40, kills: 80, mvps: 0, allPro: 0, intlTitles: 0, splitTitles: 0, intlAppearances: 0 }],
      ...(st ? { inactivePlayers: [{ playerId: "atlas", playerName: "Atlas", lane: "middle" as const, tier: "S" as const, status: yearEnd[index]!,
        inactiveYears: year - 1, demotedYear: 2, lastTeamId: "T1", lastTeamName: "T1" }] } : {}),
    };
    for (const event of calendar) {
      const isSplit = ["winter", "spring", "summer"].includes(event);
      if (isSplit) entry.splitPlacements![event as SplitId] = { LCK: [t1, rival] };
      else entry.intlPlacements![event as InternationalId] = [t1, rival];
      entry.phaseRosters!.push({ phaseIndex: entry.phaseRosters!.length, label: event,
        ...(isSplit ? { kind: "split" as const, split: event as SplitId } : { kind: "international" as const, event: event as InternationalId }),
        teams: [roster(t1, !st), roster(rival, false)],
        inactive: st ? [{ playerId: "atlas", status: st, teamId: "T1", teamName: "T1" }] : [],
      });
    }
    return entry;
  });
}

test("2 · career history shows academy team logos and no club beside FA or FA-then-retired years", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(({ season, history }) => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7,
    state: { season: null, seasonViewOpen: false, seasonHistory: [], realities: [{ id: "vf", name: "Verify", year: 4, season, history }] },
  })), { season: makeAuditSeason("Verify"), history: careerHistory() });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: /Reality.*Verify/ }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: /Atlas/ }).first().click();
  const career = page.getByRole("region", { name: "Career History", exact: true });

  const academy = career.getByRole("group", { name: "Verify Year 2 career history", exact: true });
  await expect(academy.locator("[data-career-event]")).toHaveCount(calendar.length + 1);
  for (const event of calendar) {
    const chip = academy.locator(`[data-career-event="${event}"]`);
    await expect(chip).toContainText("ACY");
    await expect(chip.locator(`img[src="${t1.logoUrl}"]`)).toHaveCount(1);
  }

  const fa = career.getByRole("group", { name: "Verify Year 3 career history", exact: true });
  await expect(fa.getByRole("button", { name: /^View T1/ })).toHaveCount(0);
  await expect(fa.getByText("Free agent", { exact: true })).toBeVisible();
  await expect(fa.locator('[data-career-event="winter"] img[src="' + t1.logoUrl + '"]')).toHaveCount(0);
  // The last club's international result is not a free agent's result.
  await expect(fa.locator('[data-career-event="msi"]')).not.toContainText("#1");

  // Retiring after a free-agent year: still no club beside the year.
  const retired = career.getByRole("group", { name: "Verify Year 4 career history", exact: true });
  await expect(retired.getByRole("button", { name: /^View T1/ })).toHaveCount(0);
  await expect(retired.getByText("Retired", { exact: true }).first()).toBeVisible();

  await career.scrollIntoViewIfNeeded();
  await career.screenshot({ path: `${SHOTS}/2-career-history-academy-fa.png` });
});

// ── 3. LoL Classic (Jade_) duplicates gone from champ select ────────────────
test("3 · champ select lists Morgana and Nasus once, even with a stale cached catalogue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Pre-fix catalogue (with the 60xxx Jade_ variants) as the cached remote list.
  const current = JSON.parse(readFileSync("lib/data/champions.json", "utf8")).champions as { id: number; alias: string; iconUrl: string }[];
  const stale = [...current, ...current.filter(c => ["Morgana", "Nasus"].includes(c.alias)).map(c => ({
    ...c, id: 60000 + c.id, alias: `Jade_${c.alias}`, lanes: [], iconUrl: c.iconUrl.replace(`/${c.id}.png`, `/${60000 + c.id}.png`),
  }))];
  await page.addInitScript(value => localStorage.setItem("draftsim-champions-v1", JSON.stringify({ version: 1, updatedAt: 0, value })), stale);
  // Keep the run offline/deterministic: no live catalogue refresh.
  await page.route(/champion-summary\.json|merakianalytics/, route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: /Solo Single Series/ }).click();
  await page.getByRole("button", { name: "BEGIN DRAFT" }).click();
  const search = page.getByLabel("Search champions by name");
  await expect(page.locator('img[src*="/champion-icons/600"]')).toHaveCount(0);
  for (const name of ["Morgana", "Nasus"]) {
    await search.fill(name);
    await expect(page.getByRole("button", { name: `Show ${name} details`, exact: true })).toHaveCount(1);
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
    await expect.poll(() => page.locator(`img[alt="${name}"]`).first().evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0), { timeout: 15000 }).toBe(true);
    await page.screenshot({ path: `${SHOTS}/3-champ-select-${name.toLowerCase()}.png` });
  }
  // Sanity: the shipped catalogue has no variant aliases left.
  const shipped = JSON.parse(readFileSync("lib/data/champions.json", "utf8")).champions as { alias: string }[];
  expect(shipped.filter(c => c.alias.includes("_"))).toEqual([]);
});

// ── 4. Live Season Results: role icons on special recognitions ──────────────
test("4 · season results stats show role icons on Performance / Most Consistent / Carry of the Losing Side", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const season = makeAuditSeason("Role icons");
  const tournament = Object.values(season.tournaments)[0];
  const match = tournament.matches.find(m => m.blueTeamId && m.redTeamId)!;
  const blue = tournament.teams.find(t => t.id === match.blueTeamId)!;
  const red = tournament.teams.find(t => t.id === match.redTeamId)!;
  blue.logoUrl = "/league-logos/LCK.png"; red.logoUrl = "/league-logos/LPL.png";
  const series = createSeries({ format: "bo5", fearless: false, timerEnabled: false, mode: "aivai", aiSide: null, aiDifficulty: "normal", blueTeam: blue.name, redTeam: red.name });
  // Five rated games so Most Consistent (min 5 games, avg ≥ 6) qualifies.
  const winners = ["blue", "red", "blue", "red", "blue"] as const;
  series.games = winners.map((winner, i) => ({ ...series.games[0], id: `ri-game-${i}`, gameNumber: i + 1, status: "complete" as const,
    blueTeam: blue.name, redTeam: red.name, winner, bluePicks: [1, 2, 3, 4, 5], redPicks: [6, 7, 8, 9, 10],
    blueRoles: [...lanes], redRoles: [...lanes],
    recap: { durationMinutes: 30, mvp: null, biggestSwing: null,
      ratings: { blue: [7, 9.4 - (i % 2) * 2, 7, 6.8, 6.5], red: [6, 6, 8.2 + (i % 2) * 0.2, 6, 6] } },
  }));
  series.status = "complete";
  tournament.matches = [{ ...match, series, winner: { teamId: blue.id, blueWins: 3, redWins: 2 }, round: 1, feedsInto: null, bracket: undefined }];
  tournament.format = "single-elim";
  tournament.status = "complete";
  season.phases[0].status = "complete";
  season.phases[0].tournamentIds = [tournament.id];
  season.phaseIndex = 1;
  await seed(page, { season, seasonViewOpen: true });
  await page.goto("/");
  await page.getByRole("button", { name: /^Stats/ }).first().click();
  const stats = page.getByRole("region", { name: `${tournament.name} statistics`, exact: true });
  for (const title of ["Performance of the Tournament", "Most Consistent", "Carry of the Losing Side"]) {
    const award = stats.getByText(`${title}:`, { exact: true }).locator("..");
    await expect(award.locator('img[src*="icon-position-"]')).toHaveCount(1);
  }
  await stats.scrollIntoViewIfNeeded();
  await stats.screenshot({ path: `${SHOTS}/4-season-results-award-roles.png` });
});

// ── 5. Hall records: event logos in Most International Trophies ─────────────
test("5 · Most International Trophies shows each event's logo with its count", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const gen = { name: "Gen.G Esports", leagueId: "LCK" as const, logoUrl: resolveTeamLogo("Gen.G Esports"), color: "#c8aa6e", iconKey: "shield" };
  // T1: 2× Worlds + 1× MSI; Gen.G: 1× First Stand + 1× MSI.
  const wins = [{ worlds: t1, msi: gen }, { worlds: t1, "first-stand": gen }, { msi: t1 }];
  const entries = wins.map((intlChampions, i) => ({ id: `rec-${i}`, name: `Record Year ${i + 1}`, archivedAt: i + 1, complete: true,
    champion: (intlChampions as { worlds?: typeof t1 }).worlds ?? null, runnerUp: null, intlChampions, splitChampions: {} }));
  await page.addInitScript(history => localStorage.setItem("draftsim-store", JSON.stringify({ version: 7, state: { seasonHistory: history, realities: [], season: null } })), entries);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Season History/ }).click();
  await page.getByRole("button", { name: "Records & Dynasties", exact: true }).click();
  const board = page.getByText("Most International Trophies", { exact: true }).locator("..");
  const t1Row = board.locator(".cv-row").filter({ hasText: "T1" });
  await expect(t1Row.locator('[data-intl-trophy="worlds"]')).toHaveText(/^2/);
  await expect(t1Row.locator('[data-intl-trophy="msi"]')).toHaveText(/^1/);
  await expect(t1Row.locator('[data-intl-trophy] img[src="/league-logos/worlds.png"]')).toHaveCount(1);
  const genRow = board.locator(".cv-row").filter({ hasText: "Gen.G" });
  await expect(genRow.locator("[data-intl-trophy]")).toHaveCount(2);
  await expect(genRow.locator("[data-intl-trophy] img")).toHaveCount(2);
  await board.scrollIntoViewIfNeeded();
  await board.screenshot({ path: `${SHOTS}/5-records-intl-trophy-logos.png` });
});
