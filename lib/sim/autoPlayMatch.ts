// Auto-play a single tournament match in AI-vs-AI mode end-to-end.
// Pure: no store access. Shared by the main thread and the bulk-sim worker.

import { applyLock, applyTimeout, currentAction } from "@/lib/draftEngine";
import { finalizeRoles } from "@/lib/sim/finalizeRoles";
import {
  applySideChoice,
  chooseSideAI,
  createSeries,
  currentGame,
  effectiveSideRule,
  fearlessLockedSet,
  nextGameSides,
  recordWinner,
  requiredWins,
  startNextGame,
  starRatingBias,
  winsByTeamName,
} from "@/lib/series";
import { chooseAIAction, getPersonality, seriesAIContextFrom } from "@/lib/draftAI";
import { chooseAIStrategyForGame, type PriorGameSummary } from "@/lib/sim/strategies";
import { buildGameRecap, computeGameRatings, simulateMatch } from "@/lib/matchSimulator";
import {
  applyRatingsToForms,
  sideFormsFor,
  type PlayerFormMap,
} from "@/lib/playerForm";
import {
  appendMatchPicks,
  computeTournamentChampionWR,
  computeTeamChampionWR,
  crossMatchFearlessLocked,
  recordMatchWinner,
  teamStarRating,
  tournamentSeriesContext,
  type TournamentState,
} from "@/lib/tournament";
import type { Champion, SeriesState, Side } from "@/lib/types";

function allChampionIds(champs: Champion[]): number[] {
  return champs.map((c) => c.id);
}

function buildPriorGamesForTeam(
  series: SeriesState,
  teamName: string,
  opponentName: string,
): PriorGameSummary[] {
  const result: PriorGameSummary[] = [];
  const completedGames = series.games.slice(0, -1);
  for (const game of completedGames) {
    if (game.winner == null) continue;
    const teamIsBlue = game.blueTeam === teamName;
    const teamSide: Side = teamIsBlue ? "blue" : "red";
    const won = game.winner === teamSide;
    const strategy = teamIsBlue ? game.blueStrategy : game.redStrategy;
    const oppStrategy = teamIsBlue ? game.redStrategy : game.blueStrategy;
    if (!strategy) continue;
    const goldTimeline = game.recap?.goldLeadTimeline;
    const finalGoldBlue = goldTimeline?.at(-1)?.goldLead ?? null;
    const goldDiff =
      finalGoldBlue != null
        ? teamIsBlue
          ? finalGoldBlue
          : -finalGoldBlue
        : undefined;
    const stomp = goldDiff != null ? Math.abs(goldDiff) >= 7000 : undefined;
    result.push({
      strategy,
      won,
      goldDiff: goldDiff ?? undefined,
      stomp,
      durationMinutes: game.recap?.durationMinutes,
      opponentStrategy: oppStrategy,
      opponentName,
    });
  }
  return result;
}

/** Returns [updatedTournament, updatedPlayerForms]. */
export function autoPlayMatch(
  workingTournament: TournamentState,
  matchId: string,
  champions: Champion[],
  playerForms: PlayerFormMap = {},
): [TournamentState, PlayerFormMap] {
  const match = workingTournament.matches.find((m) => m.id === matchId);
  if (!match) return [workingTournament, playerForms];
  if (match.winner) return [workingTournament, playerForms];
  if (match.blueTeamId == null || match.redTeamId == null) {
    return [workingTournament, playerForms];
  }
  const blueTeam = workingTournament.teams.find((t) => t.id === match.blueTeamId);
  const redTeam = workingTournament.teams.find((t) => t.id === match.redTeamId);
  if (!blueTeam || !redTeam) return [workingTournament, playerForms];
  const allIds = allChampionIds(champions);
  const tctx = tournamentSeriesContext(workingTournament, matchId);
  let series = createSeries({
    format: match.format,
    fearless: match.fearless,
    timerEnabled: false,
    blueTeam: blueTeam.name,
    redTeam: redTeam.name,
    mode: "aivai",
    aiSide: null,
    aiDifficulty: match.aiDifficulty,
    blueAiDifficulty: blueTeam.aiDifficulty,
    redAiDifficulty: redTeam.aiDifficulty,
    blueStarRating: tctx?.blueStarRating ?? teamStarRating(blueTeam),
    redStarRating: tctx?.redStarRating ?? teamStarRating(redTeam),
    blueWinStreak: tctx?.blueWinStreak,
    redWinStreak: tctx?.redWinStreak,
    tournamentRound: tctx?.roundDepth,
    blueForm: tctx?.blueForm,
    redForm: tctx?.redForm,
    blueClutch: tctx?.blueClutch,
    redClutch: tctx?.redClutch,
    variancePreset: tctx?.variancePreset,
    bluePlayers: blueTeam.players,
    redPlayers: redTeam.players,
    bluePersonalityId: blueTeam.personalityId,
    redPersonalityId: redTeam.personalityId,
    sideRule: workingTournament.sideRule,
  });
  let currentForms = playerForms;
  while (series.status !== "complete") {
    const crossLocked = crossMatchFearlessLocked(workingTournament, matchId);
    const perSeriesLocked = fearlessLockedSet(series);
    const locked = new Set<number>([...perSeriesLocked, ...crossLocked]);
    const tournamentWR = computeTournamentChampionWR(workingTournament);
    const teamWR = computeTeamChampionWR(workingTournament);
    let game = currentGame(series);
    while (currentAction(game)) {
      const action = currentAction(game)!;
      const personality = getPersonality(
        action.side === "blue" ? series.bluePersonalityId : series.redPersonalityId,
      );
      const championId = chooseAIAction(
        game,
        champions,
        locked,
        seriesAIContextFrom(
          series,
          action.side,
          champions,
          tournamentWR,
          {
            map: currentForms,
            keyFor: (n) => workingTournament.teams.find((t) => t.name === n)?.id ?? n,
          },
          teamWR,
        ),
        Math.random,
        personality,
      );
      if (championId == null) {
        game = applyTimeout(game, allIds, locked);
      } else {
        game = applyLock(game, championId);
        locked.add(championId);
      }
    }
    game = finalizeRoles(game, champions, series);
    {
      const byId = new Map(champions.map((c) => [c.id, c]));
      const toChamps = (ids: (number | null)[]) =>
        ids.map((id) => (id != null ? byId.get(id) ?? null : null));
      const blueChamps = toChamps(game.bluePicks);
      const redChamps = toChamps(game.redPicks);
      const wins = winsByTeamName(series);
      const blueWins = wins.get(game.blueTeam) ?? 0;
      const redWins = wins.get(game.redTeam) ?? 0;
      const gamesToWin = requiredWins(series.format);
      const bluePrior = buildPriorGamesForTeam(series, game.blueTeam, game.redTeam);
      const redPrior = buildPriorGamesForTeam(series, game.redTeam, game.blueTeam);
      game = {
        ...game,
        blueStrategy: chooseAIStrategyForGame({
          picks: blueChamps,
          context: {
            enemyPicks: redChamps,
            roster: series.bluePlayers,
            enemyRoster: series.redPlayers,
            selfWins: blueWins,
            oppWins: redWins,
            gamesToWin,
            rng: Math.random,
          },
          priorGames: bluePrior,
          opponentName: game.redTeam,
          rng: Math.random,
        }),
        redStrategy: chooseAIStrategyForGame({
          picks: redChamps,
          context: {
            enemyPicks: blueChamps,
            roster: series.redPlayers,
            enemyRoster: series.bluePlayers,
            selfWins: redWins,
            oppWins: blueWins,
            gamesToWin,
            rng: Math.random,
          },
          priorGames: redPrior,
          opponentName: game.blueTeam,
          rng: Math.random,
        }),
      };
    }
    series = {
      ...series,
      games: [...series.games.slice(0, -1), game],
    };
    const blueKey = blueTeam.id;
    const redKey = redTeam.id;
    const result = simulateMatch(game, champions, {
      scoreBias: starRatingBias(series),
      bluePlayers: series.bluePlayers,
      redPlayers: series.redPlayers,
      playerForms: {
        blue: sideFormsFor(currentForms, blueKey),
        red: sideFormsFor(currentForms, redKey),
      },
      adaptiveMidgame: true,
    });
    const recap = buildGameRecap(
      game,
      champions,
      result,
      series.bluePlayers,
      series.redPlayers,
    );
    if (recap.ratings) {
      currentForms = applyRatingsToForms(currentForms, blueKey, recap.ratings.blue);
      currentForms = applyRatingsToForms(currentForms, redKey, recap.ratings.red);
    } else {
      const derived = computeGameRatings(recap, result.winner);
      if (derived) {
        currentForms = applyRatingsToForms(currentForms, blueKey, derived.blue);
        currentForms = applyRatingsToForms(currentForms, redKey, derived.red);
      }
    }
    series = recordWinner(series, result.winner, recap);
    if (series.status === "between-games") {
      const rule = effectiveSideRule(series);
      if (rule === "loser-picks") {
        const chooser = series.sideChooser;
        if (chooser) {
          const chooserTeam = chooser === blueTeam.name ? blueTeam : redTeam;
          const teamPicks: number[] = [];
          for (const g of series.games) {
            const picksArr = g.blueTeam === chooser ? g.bluePicks : g.redPicks;
            for (const id of picksArr) if (id != null) teamPicks.push(id);
          }
          const chosenSide = chooseSideAI(
            { players: chooserTeam.players, pickHistory: teamPicks },
            Math.random,
          );
          series = applySideChoice(series, chosenSide);
        }
      } else {
        const sides = nextGameSides(series);
        if (sides) {
          series = startNextGame(series, sides.blueTeam, sides.redTeam);
        } else {
          const lastGame = series.games[series.games.length - 1];
          const swap = lastGame?.winner === "blue";
          const newBlue = swap ? series.redTeam : series.blueTeam;
          const newRed = swap ? series.blueTeam : series.redTeam;
          series = startNextGame(series, newBlue, newRed);
        }
      }
    }
  }
  const wins = winsByTeamName(series);
  const blueWins = wins.get(blueTeam.name) ?? 0;
  const redWins = wins.get(redTeam.name) ?? 0;
  const winningTeamId = (() => {
    if (series.winner) {
      const winningName = series.winner === "blue" ? series.blueTeam : series.redTeam;
      if (winningName === blueTeam.name) return blueTeam.id;
      if (winningName === redTeam.name) return redTeam.id;
    }
    return blueWins > redWins ? blueTeam.id : redTeam.id;
  })();
  const matchesWithSeries = workingTournament.matches.map((m) =>
    m.id === matchId ? { ...m, series } : m,
  );
  const tournamentWithSeries: TournamentState = {
    ...workingTournament,
    matches: matchesWithSeries,
  };
  const withPicks = appendMatchPicks(tournamentWithSeries, matchId, series);
  const finalTournament = recordMatchWinner(withPicks, matchId, {
    teamId: winningTeamId,
    blueWins,
    redWins,
  });
  return [finalTournament, currentForms];
}
