import { describe, expect, it } from "vitest";
import { makeAuditSeason } from "../auditFixtures";
import { createTournament, recordMatchWinner, type TournamentFormat, type TournamentState } from "../tournament";
import { createQualificationClinchDetector } from "./qualificationClinch";
import { tournamentPlacements } from "./engine";
import type { SplitId } from "./types";

function fixture(split: SplitId, format: TournamentFormat = "double-elim", count = 8) {
  const season = makeAuditSeason("Qualification");
  const teams = season.teams.filter(t => t.leagueId === "LCK").slice(0, count);
  const tournament = createTournament({ name: "LCK playoffs", format,
    teams: teams.map((t, i) => ({ ...t, seed: i + 1 })),
    defaults: { format: "bo1", mode: "aivai", aiSide: null, aiDifficulty: "normal", fearless: false, timerEnabled: false },
  });
  season.phases = [{ kind: "split", split, label: split, tournamentIds: [tournament.id], status: "in-progress" }];
  season.phaseIndex = 0;
  season.tournaments = { [tournament.id]: tournament };
  return { season, tournament, teams, detect: createQualificationClinchDetector(season, tournament) };
}

function play(t: TournamentState, id: string, winner?: string) {
  const m = t.matches.find(m => m.id === id)!;
  const teamId = winner ?? m.blueTeamId!;
  return recordMatchWinner(t, id, { teamId, blueWins: teamId === m.blueTeamId ? 1 : 0, redWins: teamId === m.redTeamId ? 1 : 0 });
}

function firstRound(t: TournamentState) {
  for (const m of t.matches.filter(m => m.round === 1 && m.bracket !== "losers" && !m.winner)) t = play(t, m.id);
  return t;
}

describe("international qualification clinches", () => {
  it.each([
    ["spring", "first-stand", "msi"],
    ["summer", "msi", "worlds"],
  ] as const)("shows the %s feeder champion as already qualified in the first match, with a frozen logo", (split, feeder, event) => {
    const { season, tournament, teams } = fixture(split);
    Object.assign(teams[0], { name: "T1", logoUrl: "/team-logos/t1.png" });
    season.intlResults = { [feeder]: [teams[0].id] };
    const detect = createQualificationClinchDetector(season, tournament);
    const before = firstRound(tournament);
    const semifinal = before.matches.find(m => m.round === 2 && m.bracket === "winners")!;
    const after = play(before, semifinal.id);
    const badges = detect(before, after);
    expect(badges).toMatchObject([{
      teamId: teams[0].id, teamName: "T1", event, via: "champion", alreadyQualified: true,
      teamLogoUrl: "/team-logos/t1.png", teamLeague: "LCK",
    }]);
    teams[0].logoUrl = "/different-logo.png";
    expect(badges[0].teamLogoUrl).toBe("/team-logos/t1.png");
    // Do not attach T1's existing berth to another team's match.
    const otherSemi = after.matches.find(m => m.round === 2 && m.bracket === "winners" && !m.winner)!;
    expect(detect(after, play(after, otherSemi.id)).some(q => q.teamId === teams[0].id)).toBe(false);
  });

  it("shows the feeder champion's existing berth during the regular split, even after a loss", () => {
    const { season, tournament } = fixture("spring", "round-robin-playoffs");
    const match = tournament.matches[0];
    season.intlResults = { "first-stand": [match.blueTeamId!] };
    const detect = createQualificationClinchDetector(season, tournament);
    expect(detect(tournament, play(tournament, match.id, match.redTeamId!))).toMatchObject([{
      teamId: match.blueTeamId, event: "msi", via: "champion", alreadyQualified: true,
    }]);
  });

  it("announces MSI when a team reaches the upper final, with no repeat after later wins", () => {
    const { tournament, detect } = fixture("spring");
    const before = firstRound(tournament);
    const semifinal = before.matches.find(m => m.round === 2 && m.bracket === "winners")!;
    let after = play(before, semifinal.id);
    const saved = JSON.stringify(after);
    expect(detect(before, after)).toMatchObject([{ teamId: semifinal.blueTeamId, teamName: after.teams.find(t => t.id === semifinal.blueTeamId)!.name, event: "msi", via: "split" }]);
    expect(JSON.stringify(after)).toBe(saved);
    const all = [];
    while (after.status !== "complete") {
      const m = after.matches.find(m => !m.winner && m.blueTeamId && m.redTeamId)!;
      const next = play(after, m.id);
      all.push(...detect(after, next).filter(q => !q.alreadyQualified));
      after = next;
    }
    expect(all.some(q => q.teamId === semifinal.blueTeamId)).toBe(false);
    expect(all).toHaveLength(2);
    expect(tournamentPlacements(after).slice(0, 3)).toEqual(expect.arrayContaining([semifinal.blueTeamId, ...all.map(q => q.teamId)]));
  });

  it("waits for both First Stand finalists instead of announcing at the upper semifinal", () => {
    const { tournament, detect } = fixture("winter");
    let t = firstRound(tournament);
    const announcements = [];
    while (t.status !== "complete") {
      const m = t.matches.find(m => !m.winner && m.blueTeamId && m.redTeamId)!;
      // Force the reset: qualification must not depend on which finalist wins.
      const next = play(t, m.id, m.bracket === "grand-final" ? m.redTeamId! : undefined);
      const badges = detect(t, next).filter(q => !q.alreadyQualified);
      if (m.bracket === "winners" && m.round === 2) expect(badges).toEqual([]);
      for (const q of badges) {
        expect(q.event).toBe("first-stand");
        expect(q.via).toBe("finalist");
        expect(next.status).not.toBe("complete");
      }
      announcements.push(...badges);
      t = next;
    }
    expect(announcements.map(q => q.teamId).sort()).toEqual(tournamentPlacements(t).slice(0, 2).sort());
  });

  it("detects a Worlds points berth for an eliminated team when another team reaches the final", () => {
    const { season, tournament, teams } = fixture("summer", "single-elim");
    const ids = teams.map(t => t.id);
    season.splitResults = { winter: { LCK: ids }, spring: { LCK: [ids[1], ids[0], ids[3], ids[2], ...ids.slice(4)] } };
    season.intlResults = { "first-stand": [ids[3]] };
    const detect = createQualificationClinchDetector(season, tournament);
    let t = tournament;
    for (const m of t.matches.filter(m => m.round === 1)) {
      t = play(t, m.id, m.blueTeamId === ids[0] ? m.redTeamId! : m.blueTeamId!);
    }
    const semifinal = t.matches.find(m => m.round === 2 && (m.blueTeamId === ids[3] || m.redTeamId === ids[3]))!;
    const badges = detect(t, play(t, semifinal.id, ids[3]));
    expect(badges).toContainEqual(expect.objectContaining({ teamId: ids[0], teamName: teams[0].name, event: "worlds", via: "points", points: 22 }));
    expect(badges.find(q => q.teamId === ids[0])!.pointsProvisional).toBeUndefined();
    expect(semifinal.blueTeamId).not.toBe(ids[0]);
    expect(semifinal.redTeamId).not.toBe(ids[0]);
  });

  it("grants Worlds finalists without confusing Summer top three with a guaranteed berth", () => {
    const { season, tournament, teams } = fixture("summer");
    const ids = teams.map(t => t.id);
    // Prior results heavily favor teams outside the upper semifinal winners.
    season.splitResults = { winter: { LCK: [...ids].reverse() }, spring: { LCK: [...ids].reverse() } };
    const detect = createQualificationClinchDetector(season, tournament);
    let t = firstRound(tournament);
    const semi = t.matches.find(m => m.round === 2 && m.bracket === "winners")!;
    let after = play(t, semi.id);
    expect(detect(t, after).some(q => q.teamId === semi.blueTeamId)).toBe(false);
    t = after;
    while (t.status !== "complete") {
      const m = t.matches.find(m => !m.winner && m.blueTeamId && m.redTeamId)!;
      after = play(t, m.id);
      const badges = detect(t, after);
      if (m.bracket === "winners" && m.round === 3) expect(badges).toContainEqual(expect.objectContaining({ teamId: m.blueTeamId, event: "worlds", via: "finalist" }));
      t = after;
    }
  });

  it("records a points floor when a newly qualified team can still improve its Summer finish", () => {
    const { tournament, detect, teams } = fixture("summer", "single-elim");
    const match = tournament.matches[0];
    const badges = detect(tournament, play(tournament, match.id));
    expect(badges).toContainEqual(expect.objectContaining({
      teamId: teams[0].id, event: "worlds", via: "points", points: 6, pointsProvisional: true,
    }));
  });

  it.each(["first-stand", "msi"] as const)("captures the %s champion berth and excludes play-ins", event => {
    const { season, tournament } = fixture("spring", "single-elim", 2);
    season.phases = [{ kind: "international", event, label: event, tournamentIds: [tournament.id], status: "in-progress" }];
    const m = tournament.matches[0];
    const after = play(tournament, m.id);
    const detect = createQualificationClinchDetector(season, tournament);
    expect(detect(tournament, after)).toEqual([expect.objectContaining({ teamId: m.blueTeamId, event: event === "msi" ? "worlds" : "msi", via: "champion" })]);
    expect(detect({ ...tournament, seasonSubStage: "play-in" }, after)).toEqual([]);
  });

  it("does not manufacture clinches from unfinished regular-stage standings", () => {
    const { tournament, detect } = fixture("winter", "round-robin-playoffs");
    expect(detect(tournament, play(tournament, tournament.matches[0].id))).toEqual([]);
  });
});
