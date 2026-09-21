import { getTeam, type TournamentState } from "./tournament";

// Recorded game highlights; one traversal, stable first-encounter ties.
// Walks every recapped game in the tournament once and picks the recorded
// extremes. Each entry tracks the originating match + game index so the
// post-tournament recap can deep-link the user straight to that game in
// the replay modal.

export interface NotableGameEntry {
  matchId: string;
  gameIdx: number;
  durationMinutes: number;
  blueTeamLabel: string;
  redTeamLabel: string;
  winnerLabel: string;
  // Lowest win-prob (from the eventual winner's perspective) reached
  // during the game. Only populated for the comeback entry; lower means
  // a deeper hole. 0 = looked dead, 1 = never looked behind.
  lowestWinnerProb?: number;
  metric?: number;
}

export interface NotableGames {
  any: boolean;
  fastest: NotableGameEntry | null;
  longest: NotableGameEntry | null;
  comeback: NotableGameEntry | null;
  mostKills: NotableGameEntry | null;
  closestKills: NotableGameEntry | null;
  biggestSwing: NotableGameEntry | null;
  largestGoldLead: NotableGameEntry | null;
}

export function computeNotableGames(tournament: TournamentState): NotableGames {
  let fastest: NotableGameEntry | null = null;
  let longest: NotableGameEntry | null = null;
  let comeback: NotableGameEntry | null = null;
  let mostKills: NotableGameEntry | null = null;
  let closestKills: NotableGameEntry | null = null;
  let biggestSwing: NotableGameEntry | null = null;
  let largestGoldLead: NotableGameEntry | null = null;
  let bestComebackDepth = 0; // 1 - lowestWinnerProb; bigger = deeper hole climbed out of

  for (const m of tournament.matches) {
    const series = m.series;
    if (!series) continue;
    const blueTeam = getTeam(tournament, m.blueTeamId);
    const redTeam = getTeam(tournament, m.redTeamId);
    series.games.forEach((g, gameIdx) => {
      const recap = g.recap;
      if (!recap || g.winner == null) return;
      // Side-aware team labels — track the per-GAME blue/red names since
      // sides can swap inside a series under the loser-picks-blue rule.
      const blueLabel = g.blueTeam || blueTeam?.name || "Blue";
      const redLabel = g.redTeam || redTeam?.name || "Red";
      const winnerLabel = g.winner === "blue" ? blueLabel : redLabel;
      const base: NotableGameEntry = {
        matchId: m.id,
        gameIdx,
        durationMinutes: recap.durationMinutes,
        blueTeamLabel: blueLabel,
        redTeamLabel: redLabel,
        winnerLabel,
      };

      if (fastest == null || recap.durationMinutes < fastest.durationMinutes) {
        fastest = base;
      }
      if (longest == null || recap.durationMinutes > longest.durationMinutes) {
        longest = base;
      }

      // Require complete observed totals; legacy missing data is not zero.
      const kills = (side: "blue" | "red") => {
        const stored = side === "blue" ? recap.blueKills : recap.redKills;
        if (stored != null) return Number.isInteger(stored) && stored >= 0 ? stored : null;
        const rows = recap.perPickKDA?.[side];
        return rows?.length === 5 && rows.every(row => Number.isInteger(row.k) && row.k >= 0)
          ? rows.reduce((sum, row) => sum + row.k, 0) : null;
      };
      const blueKills = kills("blue"), redKills = kills("red");
      if (blueKills != null && redKills != null) {
        const total = blueKills + redKills;
        const gap = Math.abs(blueKills - redKills);
        if (!mostKills || total > mostKills.metric!) mostKills = { ...base, metric: total };
        if (!closestKills || gap < closestKills.metric!) closestKills = { ...base, metric: gap };
      }
      // Peak observed advantage, either side; never infer missing timelines.
      for (const point of recap.goldLeadTimeline ?? []) {
        const lead = Math.abs(point.goldLead);
        if (Number.isFinite(lead) && (!largestGoldLead || lead > largestGoldLead.metric!)) {
          largestGoldLead = { ...base, metric: lead };
        }
      }
      const delta = recap.biggestSwing?.probDelta;
      if (delta != null && Number.isFinite(delta) && Math.abs(delta) > 0 && Math.abs(delta) <= 1
          && (!biggestSwing || Math.abs(delta) > biggestSwing.metric!)) {
        biggestSwing = { ...base, metric: Math.abs(delta) };
      }

      // Comeback magnitude: 1 - the lowest win-prob the eventual winner
      // ever reached. Requires a winProbTimeline (legacy recaps may not
      // have one — those games are silently skipped for this category).
      const tl = recap.winProbTimeline;
      if (tl && tl.length > 1) {
        let lowestWinnerProb = 1;
        for (const point of tl) {
          const winnerProb =
            g.winner === "blue" ? point.blueProb : 1 - point.blueProb;
          if (winnerProb < lowestWinnerProb) lowestWinnerProb = winnerProb;
        }
        const depth = 1 - lowestWinnerProb;
        if (depth > bestComebackDepth) {
          bestComebackDepth = depth;
          comeback = { ...base, lowestWinnerProb };
        }
      }
    });
  }

  return {
    any: fastest != null || longest != null || comeback != null,
    fastest,
    longest,
    comeback,
    mostKills,
    closestKills,
    biggestSwing,
    largestGoldLead,
  };
}
