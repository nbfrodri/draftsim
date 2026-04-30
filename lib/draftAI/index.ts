// Public draft AI API. Two entry points:
//
//   chooseAIAction — backwards-compatible wrapper that returns just the
//                    chosen champion id. Used by store hot paths where
//                    rationale isn't needed.
//
//   chooseAIActionWithRationale — full decision object including a labeled
//                                 score breakdown, intended lane, comp
//                                 identity target, and top-3 alternatives.
//                                 Used by the UI to surface what the AI is
//                                 thinking during the hover phase.
//
// Both share the same scoring path; the rationale variant just runs scoring
// once with `explain=true` for the chosen champion.

import { currentAction, usedChampionsInGame } from "../draftEngine";
import { difficultyForSide, maxGames, requiredWins, winsByTeamName } from "../series";
import type { Archetype } from "../championMeta";
import type {
  AIDifficulty,
  Champion,
  DraftMode,
  GameDraft,
  Lane,
  SeriesState,
  Side,
} from "../types";
import {
  archetypeCounts,
  bansFor,
  countNonNull,
  damageDealerCount,
  damageProfile,
  getById,
  identityTarget,
  inferLaneAssignment,
  nextActionIsEnemyPick,
  openLanes,
  picksFor,
  sampleTopN,
} from "./helpers";
import {
  scoreBan,
  scorePick,
  type BanContext,
  type PickContext,
  type ScoreComponent,
} from "./scoring";
import {
  lookahead2PlyPenalty,
  lookaheadPenalty,
  predictEnemyAnticipated,
} from "./anticipation";
import {
  BAN_TEMPERATURE,
  BAN_TOP_N,
  LOOKAHEAD_TOP_K,
  PICK_TEMPERATURE,
  PICK_TOP_N,
  POCKET_PICK_PROB,
  POCKET_PICK_TOP_N,
} from "./data";

// ─── Public types ───────────────────────────────────────────────────────────

// Optional cross-game hints — lets the AI plan across a fearless series.
export interface SeriesAIContext {
  fearless: boolean;
  gameIndex: number;
  totalGames: number;
  difficulty: AIDifficulty;
  // Champion ids picked by THIS AI's side across previous games of the
  // series. In fearless mode these are unavailable, but the AI also uses
  // this list to actively diversify (avoid building the same comp shape
  // repeatedly even in non-fearless if the user runs multiple sims).
  myPriorPicks: ReadonlySet<number>;
  // Same for the opponent side — useful for anticipation (opponent likely
  // won't repeat the comp shape they used last game).
  oppPriorPicks: ReadonlySet<number>;
  // Identity label the OPPONENT ran in each prior game, most-recent first.
  // Drives cross-game adaptation: if the opp ran Wombo Combo last game,
  // the AI prioritizes peel/disengage picks and bans wombo enablers.
  // null entries mean the prior game's identity couldn't be determined
  // (e.g. flex draft with no clear shape).
  oppPriorIdentities: ReadonlyArray<string | null>;
  // Aggregated archetype counts across ALL of the opponent's prior-game
  // picks. Useful for "they keep stacking engage" patterns even when
  // individual game identities differ.
  oppPriorArchetypeProfile: Readonly<Record<Archetype, number>>;
  // Wins so far in the series, by team identity (so side-swaps don't
  // misattribute). myWins ≥ 0; oppWins ≥ 0; their sum = games played
  // before this one.
  myWins: number;
  oppWins: number;
  // myWins - oppWins. Negative = behind, positive = ahead, 0 = tied.
  // Drives the "play safer / pick meta" signal in scoring.
  winsBehind: number;
  // True when losing this game ends the series for the AI's team — i.e.
  // the AI is on series-point against. In a BO5 with the AI at 1-2, a
  // loss makes it 1-3 (over). 2-2 is the canonical do-or-die game.
  // In a BO3 the elimination game is at 0-1 (loss → 0-2) AND 1-1.
  eliminationGame: boolean;
  // True when winning this game ends the series in the AI's favor —
  // series-point. The AI doesn't need to risk anything wild on this game.
  closeoutGame: boolean;
  // Optional tournament-wide champion W/L observed so far. Drives a
  // per-champion strength modulator in scoring so the in-tournament
  // "meta" shifts based on observed performance — a champ on a 4-1
  // streak gets a small bump; one going 1-4 gets a small penalty.
  // Undefined outside tournament context (regular series → no shift).
  tournamentChampionWR?: ReadonlyMap<
    number,
    { games: number; wins: number; winRate: number }
  >;
}

export function seriesAIContextFrom(
  series: SeriesState,
  mySide: Side,
  champions?: Champion[],
  // Optional pre-computed tournament champion WR. The store passes this
  // when the active series is a tournament match so the AI can lean
  // toward champions winning in this tournament. The function deliberately
  // doesn't import tournament module to keep this file self-contained.
  tournamentChampionWR?: ReadonlyMap<
    number,
    { games: number; wins: number; winRate: number }
  >,
): SeriesAIContext {
  // Walk all previous games (not the current one) and accumulate picks
  // by the configured team identity, accounting for side-swaps.
  const myPriorPicks = new Set<number>();
  const oppPriorPicks = new Set<number>();
  const lastIdx = series.games.length - 1;
  // Determine team-name continuity: AI's "team" at the start of the
  // series might be on either side now if sides have swapped.
  const myTeamName = mySide === "blue" ? series.blueTeam : series.redTeam;
  const oppTeamName = mySide === "blue" ? series.redTeam : series.blueTeam;

  // Per-prior-game opponent picks, in chronological order. We need this
  // (not the flat union) so we can derive each game's identity separately
  // for the cross-game adaptation logic.
  const oppPriorPicksByGame: number[][] = [];
  for (let i = 0; i < lastIdx; i++) {
    const g = series.games[i];
    const myWasBlue = g.blueTeam === myTeamName;
    const myPicks = myWasBlue ? g.bluePicks : g.redPicks;
    const oppPicks = myWasBlue ? g.redPicks : g.bluePicks;
    for (const id of myPicks) if (id != null) myPriorPicks.add(id);
    for (const id of oppPicks) if (id != null) oppPriorPicks.add(id);
    oppPriorPicksByGame.push(oppPicks.filter((id): id is number => id != null));
  }

  // Compute opponent's identity per prior game (most-recent first) and
  // their aggregated archetype profile across all prior games. Both are
  // only meaningful when the champion roster is provided — without it we
  // can't resolve ids → archetypes. Falls back to empty data.
  const oppPriorIdentities: (string | null)[] = [];
  const oppPriorArchetypeProfile: Record<Archetype, number> = {
    engage: 0,
    peel: 0,
    poke: 0,
    dive: 0,
    pick: 0,
    wombo: 0,
    "hyper-carry": 0,
    splitpush: 0,
    assassin: 0,
    tank: 0,
    enchanter: 0,
    burst: 0,
    skirmish: 0,
    sustain: 0,
  };
  if (champions) {
    const byId = getById(champions);
    // Iterate most-recent-first so consumers can read priorIdentities[0]
    // as "what they ran last game".
    for (let i = oppPriorPicksByGame.length - 1; i >= 0; i--) {
      const ids = oppPriorPicksByGame[i];
      const counts = archetypeCounts(ids, byId);
      // Aggregate per-archetype counts across games.
      for (const a of Object.keys(counts) as Archetype[]) {
        oppPriorArchetypeProfile[a] += counts[a];
      }
      // Resolve identity. picksLocked = number of non-null picks.
      const picksLocked = ids.length;
      const identity = identityTarget(counts, picksLocked);
      oppPriorIdentities.push(identity?.label ?? null);
    }
  }

  // Series score is keyed by team name (not side) — sides may have flipped
  // between games and we never want to misattribute wins.
  const wins = winsByTeamName(series);
  const myWins = wins.get(myTeamName) ?? 0;
  const oppWins = wins.get(oppTeamName) ?? 0;
  const need = requiredWins(series.format);
  // Elimination game = a loss here means the opponent reaches `need` wins.
  // Closeout game = a win here means we reach `need` wins.
  const eliminationGame = oppWins === need - 1 && myWins < need;
  const closeoutGame = myWins === need - 1 && oppWins < need;

  return {
    fearless: series.fearless,
    gameIndex: series.games.length - 1,
    totalGames: maxGames(series.format),
    // Use the side-specific difficulty if set (AI vs AI handicaps), else
    // fall back to the series-wide aiDifficulty.
    difficulty: difficultyForSide(series, mySide),
    myPriorPicks,
    oppPriorPicks,
    oppPriorIdentities,
    oppPriorArchetypeProfile,
    myWins,
    oppWins,
    winsBehind: myWins - oppWins,
    eliminationGame,
    closeoutGame,
    tournamentChampionWR,
  };
}

// Per-difficulty knobs. Easy is wide & forgiving; Hard plays close to the
// scoring optimum. Normal is the calibration baseline.
interface DifficultyKnobs {
  pickTopN: number;
  pickTemperature: number;
  banTopN: number;
  banTemperature: number;
  enableLookahead: boolean;
  // 2-ply lookahead — predicts enemy response AND our follow-up. Hard only.
  enable2PlyLookahead: boolean;
  enableAnticipation: boolean;
  enableIdentity: boolean;
  enablePocketPicks: boolean;
}

function knobsFor(difficulty: AIDifficulty): DifficultyKnobs {
  switch (difficulty) {
    case "easy":
      return {
        pickTopN: 5,
        pickTemperature: 3.5,
        banTopN: 5,
        banTemperature: 3.0,
        enableLookahead: false,
        enable2PlyLookahead: false,
        enableAnticipation: false,
        enableIdentity: false,
        enablePocketPicks: true,
      };
    case "hard":
      return {
        pickTopN: 2,
        pickTemperature: 0.9,
        banTopN: 2,
        banTemperature: 0.8,
        enableLookahead: true,
        // 2-ply only on hard — costly (~500ms extra on B1/R1/R2). The
        // strategic edge against a human player is worth it.
        enable2PlyLookahead: true,
        enableAnticipation: true,
        enableIdentity: true,
        enablePocketPicks: false,
      };
    case "normal":
    default:
      return {
        pickTopN: PICK_TOP_N,
        pickTemperature: PICK_TEMPERATURE,
        banTopN: BAN_TOP_N,
        banTemperature: BAN_TEMPERATURE,
        enableLookahead: true,
        enable2PlyLookahead: false,
        enableAnticipation: true,
        enableIdentity: true,
        enablePocketPicks: true,
      };
  }
}

export interface AIAlternative {
  championId: number;
  score: number;
}

export interface AIRationale {
  kind: "pick" | "ban";
  championId: number;
  // For picks: the lane the AI plans to slot the pick into. Null for bans.
  intendedLane: Lane | null;
  // Labeled score components for the chosen champion (sorted by absolute
  // contribution, biggest first — UI shows the most decisive factors).
  components: ScoreComponent[];
  // Total score — same as the sum of components.
  total: number;
  // For picks: the comp identity the AI is targeting (if any).
  identityLabel: string | null;
  // Top alternatives that the AI considered but didn't pick.
  alternatives: AIAlternative[];
}

// ─── Public functions ───────────────────────────────────────────────────────

export function isAITurn(
  game: GameDraft,
  mode: DraftMode,
  aiSide: Side | null,
): boolean {
  const action = currentAction(game);
  if (!action) return false;
  if (mode === "aivai") return true;
  if (mode === "pvai") return action.side === aiSide;
  return false;
}

// Backwards-compatible thin wrapper. Used by hot-paths where rationale
// isn't surfaced (e.g., the AI vs AI fast-forward loop).
export function chooseAIAction(
  game: GameDraft,
  champions: Champion[],
  fearlessLocked: ReadonlySet<number>,
  seriesCtx?: SeriesAIContext,
): number | null {
  return (
    chooseAIActionWithRationale(game, champions, fearlessLocked, seriesCtx)
      ?.championId ?? null
  );
}

// Full decision with rationale. Computes scoring once, samples the chosen
// champion, then re-scores that one with `explain=true` to capture the
// labeled breakdown for UI surfacing.
export function chooseAIActionWithRationale(
  game: GameDraft,
  champions: Champion[],
  fearlessLocked: ReadonlySet<number>,
  seriesCtx?: SeriesAIContext,
): AIRationale | null {
  const action = currentAction(game);
  if (!action) return null;

  const used = usedChampionsInGame(game);
  const byId = getById(champions);
  const candidates = champions.filter(
    (c) => !used.has(c.id) && !fearlessLocked.has(c.id),
  );
  if (candidates.length === 0) return null;

  const knobs = knobsFor(seriesCtx?.difficulty ?? "normal");

  if (action.kind === "pick") {
    return decidePick(
      action.side,
      game,
      champions,
      byId,
      candidates,
      fearlessLocked,
      seriesCtx,
      knobs,
    );
  }
  return decideBan(action, game, champions, byId, candidates, fearlessLocked, knobs, seriesCtx);
}

// ─── Pick decision ──────────────────────────────────────────────────────────

function decidePick(
  side: Side,
  game: GameDraft,
  champions: Champion[],
  byId: Map<number, Champion>,
  candidates: Champion[],
  fearlessLocked: ReadonlySet<number>,
  seriesCtx: SeriesAIContext | undefined,
  knobs: DifficultyKnobs,
): AIRationale {
  const myPicks = picksFor(game, side);
  const oppPicks = picksFor(game, side === "blue" ? "red" : "blue");
  const enemyBans = bansFor(game, side === "blue" ? "red" : "blue");
  const myCounts = archetypeCounts(myPicks, byId);
  const myPicksLocked = countNonNull(myPicks);
  // Easy mode skips identity targeting — feels less coordinated, like a
  // beginner drafter who picks individual strong champs without committing
  // to a comp shape.
  const identity = knobs.enableIdentity
    ? identityTarget(myCounts, myPicksLocked)
    : null;

  const ctx: PickContext = {
    side,
    byId,
    champions,
    myPicks,
    oppPicks,
    open: openLanes(myPicks, champions),
    myCounts,
    oppCounts: archetypeCounts(oppPicks, byId),
    myDmg: damageProfile(myPicks, byId),
    myPicksLocked,
    oppLaneAssignment: inferLaneAssignment(oppPicks, champions),
    identity,
    enemyBannedArchetypes: archetypeCounts(enemyBans, byId),
    series: seriesCtx,
    fearlessLocked,
    game,
    myDamageDealers: damageDealerCount(myPicks, byId),
  };

  // First pass: score every candidate without rationale (fast).
  const scored = candidates.map((c) => {
    const r = scorePick(c, ctx, false);
    return { item: c, score: r.total };
  });

  // Second pass: 1-ply lookahead for the top-K candidates (off in easy).
  // Hard adds 2-ply on top — predicts enemy response AND our follow-up,
  // so picks that lead to a strategic dead-end get marked down further.
  if (knobs.enableLookahead && nextActionIsEnemyPick(game, side)) {
    scored.sort((a, b) => b.score - a.score);
    for (let i = 0; i < Math.min(LOOKAHEAD_TOP_K, scored.length); i++) {
      scored[i].score += lookaheadPenalty(scored[i].item, ctx);
      if (knobs.enable2PlyLookahead) {
        scored[i].score += lookahead2PlyPenalty(scored[i].item, ctx);
      }
    }
  }

  // Pocket pick: occasionally widen the sampling pool. Off in hard mode
  // (hard always plays the top-tier optimal).
  const wildcard =
    knobs.enablePocketPicks && Math.random() < POCKET_PICK_PROB;
  const topN = wildcard ? POCKET_PICK_TOP_N : knobs.pickTopN;
  const chosen =
    sampleTopN(scored, topN, knobs.pickTemperature) ?? candidates[0];

  // Re-score the chosen one with explain=true for rationale.
  const explained = scorePick(chosen, ctx, true);
  // Sort components by absolute contribution so the UI shows the most
  // decisive factors first.
  const components = (explained.breakdown ?? []).slice().sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value),
  );

  // Top-3 alternatives (excluding the chosen one).
  const alternatives = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.item.id !== chosen.id)
    .slice(0, 3)
    .map((s) => ({ championId: s.item.id, score: s.score }));

  return {
    kind: "pick",
    championId: chosen.id,
    intendedLane: explained.intendedLane,
    components,
    total: explained.total,
    identityLabel: identity?.label ?? null,
    alternatives,
  };
}

// ─── Ban decision ───────────────────────────────────────────────────────────

function decideBan(
  action: { side: Side; index: number },
  game: GameDraft,
  champions: Champion[],
  byId: Map<number, Champion>,
  candidates: Champion[],
  fearlessLocked: ReadonlySet<number>,
  knobs: DifficultyKnobs,
  seriesCtx: SeriesAIContext | undefined,
): AIRationale {
  const myPicks = picksFor(game, action.side);
  const oppPicks = picksFor(game, action.side === "blue" ? "red" : "blue");
  const myCounts = archetypeCounts(myPicks, byId);

  // Easy skips anticipation — bans become generic high-tier denials.
  const enemyAnticipated = knobs.enableAnticipation
    ? predictEnemyAnticipated(game, action.side, champions, fearlessLocked)
    : new Set<number>();

  const ctx: BanContext = {
    byId,
    myCounts,
    oppPicks,
    isPhase2: action.index >= 12,
    enemyAnticipated,
    series: seriesCtx,
  };

  const scored = candidates.map((c) => {
    const r = scoreBan(c, ctx, false);
    return { item: c, score: r.total };
  });

  const chosen =
    sampleTopN(scored, knobs.banTopN, knobs.banTemperature) ?? candidates[0];

  const explained = scoreBan(chosen, ctx, true);
  const components = (explained.breakdown ?? []).slice().sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value),
  );

  const alternatives = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.item.id !== chosen.id)
    .slice(0, 3)
    .map((s) => ({ championId: s.item.id, score: s.score }));

  return {
    kind: "ban",
    championId: chosen.id,
    intendedLane: null,
    components,
    total: explained.total,
    identityLabel: null,
    alternatives,
  };
}

// Re-export types that callers need.
export type { ScoreComponent } from "./scoring";
