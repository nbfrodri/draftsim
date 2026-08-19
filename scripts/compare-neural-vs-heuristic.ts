// Compara win rates: neural vs heuristica en drafts AI vs AI.
// Run: npx tsx scripts/compare-neural-vs-heuristic.ts

import * as fs from "fs";
import * as path from "path";
import { createGame, currentAction, applyLock, applyTimeout } from "../lib/draftEngine";
import { simulateMatch } from "../lib/matchSimulator";
import { finalizeRoles } from "../lib/sim/finalizeRoles";
import {
  chooseAIActionWithRationale,
  type SeriesAIContext,
} from "../lib/draftAI";
import {
  chooseNeuralDraftActionWithRationale,
  initNeuralDraftPolicyAsync,
  injectNeuralPolicy,
  resetNeuralDraftPolicy,
  isNeuralPolicyLoaded,
  type NeuralPolicyWeights,
} from "../lib/draftAI/neural";
import type { Champion, Lane, Side } from "../lib/types";
import type { Archetype } from "../lib/championMeta";

const CHAMPIONS_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";
const MERAKI_URL =
  "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json";

const MERAKI_POS_TO_LANE: Record<string, Lane> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  BOTTOM: "bottom",
  SUPPORT: "support",
};

type DraftBackend = "neural" | "heuristic";

interface RawChampion {
  id: number;
  name: string;
  alias: string;
  roles?: string[];
}

interface MerakiChampion {
  id: number;
  positions?: string[];
}

async function fetchChampions(): Promise<Champion[]> {
  const [rawArr, lanesMap] = await Promise.all([
    fetch(CHAMPIONS_URL).then((r) => {
      if (!r.ok) throw new Error(`CommunityDragon: ${r.status}`);
      return r.json() as Promise<RawChampion[]>;
    }),
    fetch(MERAKI_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => {
        const out: Record<number, Lane[]> = {};
        for (const entry of Object.values(raw as Record<string, MerakiChampion>)) {
          if (typeof entry?.id !== "number") continue;
          out[entry.id] = (entry.positions ?? [])
            .map((p) => MERAKI_POS_TO_LANE[p])
            .filter((l): l is Lane => !!l);
        }
        return out;
      })
      .catch(() => ({}) as Record<number, Lane[]>),
  ]);
  return rawArr
    .filter((c) => c.id > 0)
    .filter((c) => !c.alias.startsWith("Ruby_"))
    .map<Champion>((c) => ({
      id: c.id,
      name: c.name,
      alias: c.alias,
      roles: c.roles ?? [],
      iconUrl: "",
      lanes: lanesMap[c.id] ?? [],
    }));
}

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

function emptyArchetypeProfile(): Record<Archetype, number> {
  return {
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
}

function seriesCtx(side: Side, rng: () => number): SeriesAIContext {
  const myWins = Math.floor(rng() * 2);
  const oppWins = Math.floor(rng() * 2);
  return {
    fearless: false,
    gameIndex: 0,
    totalGames: 1,
    difficulty: "normal",
    myPriorPicks: new Set(),
    oppPriorPicks: new Set(),
    oppPriorIdentities: [],
    oppPriorArchetypeProfile: emptyArchetypeProfile(),
    myWins,
    oppWins,
    winsBehind: myWins - oppWins,
    eliminationGame: false,
    closeoutGame: false,
  };
}

const MODEL_PATH = path.resolve(process.cwd(), "public/models/draft-policy.json");

function loadWeights(): NeuralPolicyWeights {
  const raw = fs.readFileSync(MODEL_PATH, "utf8");
  return JSON.parse(raw) as NeuralPolicyWeights;
}

function isNeuralRationale(r: { components: { label: string }[] } | null): boolean {
  return (
    r?.components.some(
      (c) => c.label === "Neural confidence" || c.label === "Neural policy",
    ) ?? false
  );
}

function activateNeural(champions: Champion[], weights: NeuralPolicyWeights): void {
  injectNeuralPolicy(champions, weights);
}

function activateHeuristicOnly(): void {
  resetNeuralDraftPolicy();
}

function pickForSide(
  game: ReturnType<typeof createGame>,
  champions: Champion[],
  fearlessLocked: Set<number>,
  side: Side,
  backend: DraftBackend,
  weights: NeuralPolicyWeights,
  rng: () => number,
): ReturnType<typeof chooseAIActionWithRationale> {
  const ctx = seriesCtx(side, rng);
  if (backend === "neural") {
    if (!isNeuralPolicyLoaded()) activateNeural(champions, weights);
    return chooseNeuralDraftActionWithRationale(
      game,
      champions,
      fearlessLocked,
      ctx,
      rng,
    );
  }
  activateHeuristicOnly();
  return chooseAIActionWithRationale(game, champions, fearlessLocked, ctx, rng);
}

function runDraft(
  champions: Champion[],
  blueBackend: DraftBackend,
  redBackend: DraftBackend,
  weights: NeuralPolicyWeights,
  rng: () => number,
) {
  if (blueBackend === "neural" && redBackend === "neural") {
    activateNeural(champions, weights);
  } else if (blueBackend === "heuristic" && redBackend === "heuristic") {
    activateHeuristicOnly();
  }

  let game = createGame(1, "Blue", "Red");
  const fearlessLocked = new Set<number>();
  const allIds = champions.map((c) => c.id);
  let neuralPicks = 0;
  let heuristicPicks = 0;

  while (currentAction(game)) {
    const action = currentAction(game)!;
    const backend = action.side === "blue" ? blueBackend : redBackend;
    const rationale = pickForSide(
      game,
      champions,
      fearlessLocked,
      action.side,
      backend,
      weights,
      rng,
    );
    if (rationale) {
      if (isNeuralRationale(rationale)) neuralPicks++;
      else heuristicPicks++;
      game = applyLock(game, rationale.championId);
      fearlessLocked.add(rationale.championId);
    } else {
      game = applyTimeout(game, allIds, fearlessLocked);
    }
  }

  try {
    game = finalizeRoles(
      game,
      champions,
      { bluePlayers: undefined, redPlayers: undefined } as never,
    );
  } catch {
    // keep raw picks
  }

  const sim = simulateMatch(game, champions);
  return { game, sim, neuralPicks, heuristicPicks };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const d = Math.sqrt(dx2 * dy2);
  return d === 0 ? 0 : num / d;
}

interface ConditionResult {
  label: string;
  games: number;
  blueWins: number;
  redWins: number;
  draws: number;
  avgScoreDiff: number;
  scoreDiffWR: number;
  neuralPickTurns: number;
  heuristicPickTurns: number;
}

function runCondition(
  label: string,
  champions: Champion[],
  n: number,
  seed: number,
  blueBackend: DraftBackend,
  redBackend: DraftBackend,
  weights: NeuralPolicyWeights,
): ConditionResult {
  let blueWins = 0;
  let redWins = 0;
  let draws = 0;
  let sumDiff = 0;
  const diffs: number[] = [];
  const blueWinFlags: number[] = [];
  let neuralPickTurns = 0;
  let heuristicPickTurns = 0;

  const prevDisabled = process.env.NEURAL_DRAFT_DISABLED;
  if (blueBackend === "heuristic" && redBackend === "heuristic") {
    process.env.NEURAL_DRAFT_DISABLED = "1";
  } else {
    delete process.env.NEURAL_DRAFT_DISABLED;
  }

  for (let i = 0; i < n; i++) {
    const rng = makeLCG(seed + i * 9973);
    const { sim, neuralPicks, heuristicPicks } = runDraft(
      champions,
      blueBackend,
      redBackend,
      weights,
      rng,
    );
    neuralPickTurns += neuralPicks;
    heuristicPickTurns += heuristicPicks;
    const diff = sim.blueScore.total - sim.redScore.total;
    sumDiff += diff;
    diffs.push(diff);
    if (sim.winner === "blue") {
      blueWins++;
      blueWinFlags.push(1);
    } else if (sim.winner === "red") {
      redWins++;
      blueWinFlags.push(0);
    } else {
      draws++;
      blueWinFlags.push(0.5);
    }
  }

  if (prevDisabled === undefined) delete process.env.NEURAL_DRAFT_DISABLED;
  else process.env.NEURAL_DRAFT_DISABLED = prevDisabled;

  return {
    label,
    games: n,
    blueWins,
    redWins,
    draws,
    avgScoreDiff: sumDiff / n,
    scoreDiffWR: pearson(diffs, blueWinFlags),
    neuralPickTurns,
    heuristicPickTurns,
  };
}

async function verifyModelLoad(
  champions: Champion[],
  weights: NeuralPolicyWeights,
): Promise<void> {
  resetNeuralDraftPolicy();
  delete process.env.NEURAL_DRAFT_DISABLED;
  const ok = await initNeuralDraftPolicyAsync(champions, MODEL_PATH);
  console.log("\n=== VERIFICACION DE CARGA ===");
  console.log(`Modelo en disco: ${fs.existsSync(MODEL_PATH)} (${fs.statSync(MODEL_PATH).size} bytes)`);
  console.log(`initNeuralDraftPolicyAsync: ${ok}`);
  console.log(`isNeuralPolicyLoaded: ${isNeuralPolicyLoaded()}`);
  const game = createGame(1, "Blue", "Red");
  const r = chooseNeuralDraftActionWithRationale(game, champions, new Set());
  console.log(
    `chooseNeuralDraftActionWithRationale activo: ${isNeuralRationale(r)} (champId=${r?.championId})`,
  );

  activateHeuristicOnly();
  process.env.NEURAL_DRAFT_DISABLED = "1";
  const r2 = chooseAIActionWithRationale(game, champions, new Set());
  console.log(
    `Heuristica (sin modelo): ${!isNeuralRationale(r2)} (champId=${r2?.championId})`,
  );
  delete process.env.NEURAL_DRAFT_DISABLED;

  activateNeural(champions, weights);
  const r3 = chooseAIActionWithRationale(game, champions, new Set());
  console.log(
    `chooseAIActionWithRationale con modelo cargado: ${isNeuralRationale(r3)} (via neural primero)`,
  );
}

async function main(): Promise<void> {
  const n = Number(process.env.COMPARE_GAMES ?? "400");
  const seed = Number(process.env.COMPARE_SEED ?? "42");
  console.log(`[compare] ${n} partidas/condicion, seed=${seed}`);

  const champions = await fetchChampions();
  console.log(`[compare] ${champions.length} campeones`);
  const weights = loadWeights();

  await verifyModelLoad(champions, weights);

  const conditions: Array<[string, DraftBackend, DraftBackend]> = [
    ["neural vs neural", "neural", "neural"],
    ["heuristic vs heuristic", "heuristic", "heuristic"],
    ["neural (blue) vs heuristic (red)", "neural", "heuristic"],
    ["heuristic (blue) vs neural (red)", "heuristic", "neural"],
  ];

  const results: ConditionResult[] = [];
  for (const [label, blue, red] of conditions) {
    console.log(`[compare] Corriendo: ${label}...`);
    const t0 = Date.now();
    results.push(runCondition(label, champions, n, seed, blue, red, weights));
    console.log(`[compare]   listo en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  console.log("\n=== WIN RATES (post-draft simulateMatch) ===");
  console.log(
    "condicion".padEnd(38) +
      "blue WR".padStart(9) +
      "red WR".padStart(9) +
      "draw".padStart(7) +
      "avg dScore".padStart(11) +
      "r(d,win)".padStart(10),
  );
  for (const r of results) {
    const g = r.games;
    console.log(
      r.label.padEnd(38) +
        `${((r.blueWins / g) * 100).toFixed(1)}%`.padStart(9) +
        `${((r.redWins / g) * 100).toFixed(1)}%`.padStart(9) +
        `${((r.draws / g) * 100).toFixed(1)}%`.padStart(7) +
        r.avgScoreDiff.toFixed(2).padStart(11) +
        r.scoreDiffWR.toFixed(3).padStart(10),
    );
  }

  console.log("\n=== PATH DE DECISION (turnos de draft) ===");
  for (const r of results) {
    const total = r.neuralPickTurns + r.heuristicPickTurns;
    console.log(
      `${r.label}: neural=${r.neuralPickTurns} heur=${r.heuristicPickTurns} (${total} turnos)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
