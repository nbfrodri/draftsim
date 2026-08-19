// Generador de dataset de turnos del draft para entrenamiento de la red neuronal.
//
// Simula N partidas completas usando la IA heurística como "profesor" (behavior
// cloning), registra el estado del draft en cada turno, y escribe el resultado
// en un archivo JSONL. Cada línea es un DraftTurnRecord serializado.
//
// Uso:
//   npx tsx scripts/generate-draft-dataset.ts
//
// Variables de entorno:
//   DATASET_GAMES=500000        Número de partidas a simular (default: 1000)
//   DATASET_OUTPUT=data/draft-dataset.jsonl  Ruta del archivo de salida
//   DATASET_APPEND=false        Si "true", añade al archivo existente
//   DATASET_SEED=42             Semilla RNG para reproducibilidad

import * as fs from "fs";
import * as path from "path";
import { createGame, assignLanesToPicks } from "../lib/draftEngine";
import { currentAction, applyLock, applyTimeout } from "../lib/draftEngine";
import { simulateMatch } from "../lib/matchSimulator";
import { finalizeRoles } from "../lib/sim/finalizeRoles";
import {
  chooseAIActionWithRationale,
  getPersonality,
  PERSONALITY_LIST,
  type SeriesAIContext,
} from "../lib/draftAI";
import {
  buildChampionIndex,
  encodeDraftState,
} from "../lib/draftAI/neural/stateEncoder";
import {
  createDraftLogger,
  type DraftLogger,
} from "../lib/draftAI/neural/logger";
import type { Champion, Lane, AIDifficulty, Side } from "../lib/types";
import type { Archetype } from "../lib/championMeta";

// ─── Configuración ────────────────────────────────────────────────────────────

const DATASET_GAMES = parseInt(process.env.DATASET_GAMES ?? "1000", 10);
const DATASET_OUTPUT = process.env.DATASET_OUTPUT ?? "data/draft-dataset.jsonl";
const DATASET_APPEND = process.env.DATASET_APPEND === "true";
const LOG_INTERVAL = Math.max(100, Math.floor(DATASET_GAMES / 200));

// ─── Fetch de campeones ──────────────────────────────────────────────────────

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
  console.log("[dataset] Obteniendo roster de campeones...");
  const [rawArr, lanesMap] = await Promise.all([
    fetch(CHAMPIONS_URL).then((r) => {
      if (!r.ok) throw new Error(`CommunityDragon: ${r.status}`);
      return r.json() as Promise<RawChampion[]>;
    }),
    fetch(MERAKI_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Meraki: ${r.status}`);
        return r.json() as Promise<Record<string, MerakiChampion>>;
      })
      .then((raw) => {
        const out: Record<number, Lane[]> = {};
        for (const entry of Object.values(raw)) {
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

// ─── Generador de números pseudoaleatorios (LCG) ────────────────────────────

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

// IDs de personalidades disponibles para variar los datos
const PERSONALITY_IDS = PERSONALITY_LIST.map((p) => p.id);

// ─── Construir un SeriesAIContext variado ─────────────────────────────────────

function makeSeriesCtx(
  difficulty: AIDifficulty,
  side: Side,
  fearless: boolean,
  totalGames: number,
  gameIndex: number,
  myWins: number,
  oppWins: number,
  rng: () => number,
): SeriesAIContext {
  const winsBehind = myWins - oppWins;
  const gamesToWin = Math.ceil(totalGames / 2);
  return {
    fearless,
    gameIndex,
    totalGames,
    difficulty,
    myPriorPicks: new Set<number>(),
    oppPriorPicks: new Set<number>(),
    oppPriorIdentities: [],
    oppPriorArchetypeProfile: {
      engage: 0, peel: 0, poke: 0, dive: 0, pick: 0, wombo: 0,
      "hyper-carry": 0, splitpush: 0, assassin: 0, tank: 0,
      enchanter: 0, burst: 0, skirmish: 0, sustain: 0,
    } as Record<Archetype, number>,
    myWins,
    oppWins,
    winsBehind,
    eliminationGame: totalGames > 1 && oppWins === gamesToWin - 1 && myWins < gamesToWin,
    closeoutGame: totalGames > 1 && myWins === gamesToWin - 1 && oppWins < gamesToWin,
  };
}

// ─── Simular una partida completa y loguear cada turno ───────────────────────

function simulateAndLogGame(
  gameId: number,
  champions: Champion[],
  rng: () => number,
): DraftLogger {
  const logger = createDraftLogger();
  const champIndex = buildChampionIndex(champions);

  const difficulties: AIDifficulty[] = ["easy", "normal", "hard"];
  const diff = difficulties[Math.floor(rng() * difficulties.length)];

  // Variación de serie: Bo1, Bo3 o Bo5
  const formatRoll = rng();
  const totalGames = formatRoll < 0.4 ? 1 : formatRoll < 0.7 ? 3 : 5;
  const gamesToWin = Math.ceil(totalGames / 2);

  // Estado de la serie: simular un punto aleatorio durante la serie
  const maxWins = gamesToWin - 1;
  const blueWins = totalGames > 1 ? Math.floor(rng() * gamesToWin) : 0;
  const redWins = totalGames > 1 ? Math.floor(rng() * gamesToWin) : 0;
  const gameIndex = Math.min(blueWins + redWins, totalGames - 1);

  const fearless = rng() < 0.25 && totalGames > 1;

  // Personalidades (varían por lado para más diversidad de datos)
  const bluePersonalityId = PERSONALITY_IDS[Math.floor(rng() * PERSONALITY_IDS.length)];
  const redPersonalityId = PERSONALITY_IDS[Math.floor(rng() * PERSONALITY_IDS.length)];

  const blueCtx = makeSeriesCtx(diff, "blue", fearless, totalGames, gameIndex, blueWins, redWins, rng);
  const redCtx = makeSeriesCtx(diff, "red", fearless, totalGames, gameIndex, redWins, blueWins, rng);

  let game = createGame(gameId, "BlueTeam", "RedTeam");
  const fearlessLocked = new Set<number>();
  const allIds = champions.map((c) => c.id);

  while (currentAction(game)) {
    const action = currentAction(game)!;
    const aiSide = action.side;
    const seriesCtx = aiSide === "blue" ? blueCtx : redCtx;
    const personalityId = aiSide === "blue" ? bluePersonalityId : redPersonalityId;
    const personality = getPersonality(personalityId);

    // Codificar estado ANTES de aplicar la acción
    const stateVec = encodeDraftState(
      game,
      champions,
      champIndex,
      aiSide,
      fearlessLocked,
      seriesCtx,
    );

    // La IA heurística elige la acción
    const rationale = chooseAIActionWithRationale(
      game,
      champions,
      fearlessLocked,
      seriesCtx,
      rng,
      personality,
    );

    if (!rationale) {
      game = applyTimeout(game, allIds, fearlessLocked);
      continue;
    }

    const chosenId = rationale.championId;
    const slot = champIndex.idToSlot.get(chosenId);

    if (slot === undefined) {
      game = applyLock(game, chosenId);
      fearlessLocked.add(chosenId);
      continue;
    }

    logger.record(stateVec, slot, chosenId, action.kind, aiSide, {
      difficulty: diff,
      personalityId: rationale.personalityId ?? personalityId,
      gameIndex: seriesCtx.gameIndex,
      fearless: seriesCtx.fearless,
      actionIndex: game.actionIndex,
    });

    game = applyLock(game, chosenId);
    fearlessLocked.add(chosenId);
  }

  // Finalizar roles para simulación
  let finalGame = game;
  try {
    const stubSeries = {
      bluePlayers: undefined,
      redPlayers: undefined,
    } as unknown as Parameters<typeof finalizeRoles>[2];
    finalGame = finalizeRoles(game, champions, stubSeries);
  } catch {
    finalGame = game;
  }

  const result = simulateMatch(finalGame, champions);
  const winner = result.winner;

  const outcomeForBlue: "win" | "loss" | "draw" =
    winner === "blue" ? "win" : winner === "red" ? "loss" : "draw";

  logger.setOutcome(outcomeForBlue);
  for (const rec of logger.getRecords()) {
    if (rec.side === "red") {
      rec.outcome = winner === "red" ? "win" : winner === "blue" ? "loss" : "draw";
    }
  }

  return logger;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const champions = await fetchChampions();
  console.log(`[dataset] ${champions.length} campeones cargados.`);

  const outDir = path.dirname(DATASET_OUTPUT);
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(DATASET_OUTPUT, {
    flags: DATASET_APPEND ? "a" : "w",
    encoding: "utf8",
  });

  console.log(
    `[dataset] Generando ${DATASET_GAMES.toLocaleString()} partidas → ${DATASET_OUTPUT}`,
  );
  console.log(`[dataset] Intervalo de log: cada ${LOG_INTERVAL} partidas`);

  let totalTurns = 0;
  const seed = parseInt(process.env.DATASET_SEED ?? String(Date.now()), 10);
  const startTime = Date.now();

  for (let i = 0; i < DATASET_GAMES; i++) {
    const rng = makeLCG(seed + i * 17239);
    const logger = simulateAndLogGame(i, champions, rng);
    const jsonl = logger.toJSONL();
    if (jsonl) {
      writeStream.write(jsonl + "\n");
      totalTurns += logger.getRecords().length;
    }

    if ((i + 1) % LOG_INTERVAL === 0 || i === DATASET_GAMES - 1) {
      const elapsed = (Date.now() - startTime) / 1000;
      const pct = ((i + 1) / DATASET_GAMES * 100).toFixed(1);
      const eta = elapsed / (i + 1) * (DATASET_GAMES - i - 1);
      const etaStr = eta < 60
        ? `${eta.toFixed(0)}s`
        : `${(eta / 60).toFixed(1)}min`;
      console.log(
        `[dataset] ${(i + 1).toLocaleString()}/${DATASET_GAMES.toLocaleString()} ` +
        `partidas (${pct}%) — ${totalTurns.toLocaleString()} turnos — ` +
        `${elapsed.toFixed(0)}s transcurridos, ETA ${etaStr}`,
      );
    }
  }

  await new Promise<void>((res, rej) => {
    writeStream.end((err?: Error | null) => (err ? rej(err) : res()));
  });

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[dataset] ✓ Completado: ${DATASET_GAMES.toLocaleString()} partidas, ` +
    `${totalTurns.toLocaleString()} turnos → ${DATASET_OUTPUT} (${totalSec}s)`,
  );
  console.log(
    `[dataset] Ejecuta el entrenamiento Python con: cd training && python train_bc.py`,
  );
}

main().catch((e) => {
  console.error("[dataset] Error:", e);
  process.exit(1);
});
