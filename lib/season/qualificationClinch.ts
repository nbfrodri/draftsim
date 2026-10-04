import {
  formatHasPlayoffs, playoffBracketKindFor, recordMatchWinner,
  type TournamentState,
} from "../tournament";
import { feederEventOf, leagueOfTournament, qualifiedForInternational, tournamentPlacements } from "./engine";
import { SPLIT_FEEDS_EVENT, type InternationalId, type LeagueId, type SeasonState, type SplitId } from "./types";

export interface QualificationClinch {
  teamId: string;
  teamName: string;
  teamLogoUrl?: string;
  teamIconKey?: string;
  teamColor?: string;
  teamLeague?: LeagueId;
  event: InternationalId;
  via: "finalist" | "points" | "split" | "champion";
  /** Existing berth shown for a participant; not a new clinch announcement. */
  alreadyQualified?: true;
  /** Exact points at this result, or the guaranteed floor while Summer is unresolved. */
  points?: number;
  pointsProvisional?: true;
}

type Certainty = QualificationClinch["via"] | false | undefined;

/** Fixed elimination brackets have score-independent finish orders. Never project
 * regular-stage tiebreakers or dynamic pairings using invented game scores. */
function canProject(t: TournamentState) {
  if (t.format === "single-elim" || t.format === "double-elim") return true;
  if (!formatHasPlayoffs(t.format) || !t.matches.some(m => m.bracket)) return false;
  const kind = playoffBracketKindFor(t.format);
  return kind === "single-elim" || kind === "double-elim";
}

/** One detector per matchday: caches pre/post-match outlooks without subscribing
 * the UI to histories, changing saves, or running match simulations. */
export function createQualificationClinchDetector(season: SeasonState, tournament: TournamentState) {
  const phase = season.phases.find(p => p.tournamentIds.includes(tournament.id));
  const league = leagueOfTournament(season, tournament);
  const split = phase?.kind === "split" ? phase.split : undefined;
  const event = split ? SPLIT_FEEDS_EVENT[split]
    : phase?.event === "first-stand" ? "msi" : phase?.event === "msi" ? "worlds" : undefined;
  const cache = new WeakMap<TournamentState, Map<string, Certainty>>();
  const pointCache = new WeakMap<TournamentState, Map<string, { points: number; pointsProvisional?: true }>>();
  const feeder = event ? feederEventOf(event) : null;
  const automaticChampion = feeder ? season.intlResults[feeder]?.[0] : undefined;

  function qualifiers(t: TournamentState, split: SplitId, league: LeagueId, event: InternationalId) {
    return qualifiedForInternational({
      ...season,
      splitResults: { ...season.splitResults, [split]: {
        ...season.splitResults[split], [league]: tournamentPlacements(t),
      } },
    }, event).filter(q => q.league === league);
  }

  function outlook(t: TournamentState): Map<string, Certainty> {
    const cached = cache.get(t);
    if (cached) return cached;
    const out = new Map<string, Certainty>();
    const pointTotals = new Map<string, { points: number; pointsProvisional?: true }>();
    cache.set(t, out);
    pointCache.set(t, pointTotals);
    if (!event) return out;
    if (!split || !league) {
      // Winning First Stand/MSI grants an additive berth in the next event.
      if (t.status === "complete" && t.seasonSubStage !== "play-in") {
        const champion = tournamentPlacements(t)[0];
        if (champion) out.set(champion, "champion");
      }
      return out;
    }
    // The feeder champion already has a berth, even during the regular stage
    // or when a later league finish would also qualify it. Preserve that reason.
    if (automaticChampion && t.teams.some(team => team.id === automaticChampion)) {
      out.set(automaticChampion, "champion");
    }
    const finalQualifiers = (state: TournamentState) => qualifiers(state, split, league, event);
    if (t.status === "complete") {
      for (const team of t.teams) if (!out.has(team.id)) out.set(team.id, false);
      for (const q of finalQualifiers(t)) {
        out.set(q.team.id, q.team.id === automaticChampion ? "champion" : q.via === "split" && event !== "msi" ? "finalist" : q.via);
        if (q.points != null) pointTotals.set(q.team.id, { points: q.points });
      }
      return out;
    }
    if (!canProject(t)) return out;

    // Search for a counterexample for each team. Try its losses first, so an
    // unclinched berth is normally disproved in a single completed bracket.
    // Bound work for large custom fields; an unfinished proof means unknown,
    // never a badge. The ordinary 4/6/8-team playoff endgames fit comfortably.
    for (const team of t.teams) {
      if (out.has(team.id)) continue;
      let nodes = 0;
      let alwaysFinalist = true;
      let championBerth = false;
      let minimumPoints = Infinity;
      let maximumPoints = -Infinity;
      function prove(state: TournamentState): boolean | undefined {
        if (++nodes > 20_000) return undefined;
        if (state.status === "complete") {
          const q = finalQualifiers(state).find(q => q.team.id === team.id);
          if (!q) return false;
          if (q.points != null) {
            minimumPoints = Math.min(minimumPoints, q.points);
            maximumPoints = Math.max(maximumPoints, q.points);
          }
          alwaysFinalist &&= q.via === "split";
          championBerth ||= q.via === "champion";
          return true;
        }
        const ready = state.matches.filter(m => !m.winner && m.blueTeamId && m.redTeamId);
        const match = ready.find(m => m.blueTeamId === team.id || m.redTeamId === team.id) ?? ready[0];
        if (!match) return undefined;
        const outcomes = match.blueTeamId === team.id
          ? [match.redTeamId!, match.blueTeamId!]
          : [match.blueTeamId!, match.redTeamId!];
        let unknown = false;
        for (const winner of outcomes) {
          // A reset changes the number of series, not the possible final orders.
          // Collapsing it also avoids creating random match IDs during projection.
          const next = recordMatchWinner({ ...state, trueGrandFinal: true }, match.id, {
            teamId: winner, blueWins: winner === match.blueTeamId ? 1 : 0,
            redWins: winner === match.redTeamId ? 1 : 0,
          });
          const result = prove(next);
          if (result === false) return false;
          if (result === undefined) unknown = true;
        }
        return unknown ? undefined : true;
      }
      const certain = prove(t);
      out.set(team.id, certain === true
        ? championBerth ? "champion" : event === "msi" ? "split" : alwaysFinalist ? "finalist" : "points"
        : certain);
      if (certain === true && Number.isFinite(minimumPoints)) pointTotals.set(team.id, {
        points: minimumPoints,
        ...(minimumPoints !== maximumPoints ? { pointsProvisional: true as const } : {}),
      });
    }
    return out;
  }

  return (before: TournamentState, after: TournamentState): QualificationClinch[] => {
    if (!event || before.seasonSubStage === "play-in") return [];
    const previous = outlook(before);
    const previousMatches = new Map(before.matches.map(m => [m.id, m]));
    const participants = new Set(after.matches
      .filter(m => m.winner && !m.isBye && previousMatches.has(m.id) && !previousMatches.get(m.id)?.winner)
      .flatMap(m => [m.blueTeamId, m.redTeamId]));
    return [...outlook(after)].flatMap(([teamId, via]) => {
      if (!via) return [];
      const alreadyQualified = !!previous.get(teamId);
      if (alreadyQualified && !participants.has(teamId)) return [];
      // A capped search cannot establish which match clinched the berth.
      if (split && canProject(before) && previous.get(teamId) === undefined) return [];
      const team = season.teams.find(t => t.id === teamId);
      return team ? [{
        teamId, teamName: team.name, teamLogoUrl: team.logoUrl, teamIconKey: team.iconKey,
        teamColor: team.color, teamLeague: team.leagueId, event, via,
        ...pointCache.get(after)?.get(teamId),
        ...(alreadyQualified ? { alreadyQualified: true as const } : {}),
      }] : [];
    });
  };
}
