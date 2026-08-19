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
//   DATASET_GAMES=1000          Número de partidas a simular (default: 1000)
//   DATASET_OUTPUT=data/draft-dataset.jsonl  Ruta del archivo de salida
//   DATASET_APPEND=false        Si "true", añade al archivo existente en vez de sobreescribir

import * as fs from "fs";
import * as path from "path";
import { createGame, POSITIONAL_LANES, assignLanesToPicks } from "../lib/draftEngine";
import { currentAction, applyLock, applyTimeout } from "../lib/draftEngine";
import { simulateMatch } from "../lib/matchSimulator";
import { finalizeRoles } from "../lib/sim/finalizeRoles";
import {
  chooseAIActionWithRationale,
  type SeriesAIContext,
  type AIActionOptions,
} from "../lib/draftAI";
import {
  buildChampionIndex,
  encodeDraftState,
} from "../lib/draftAI/neural/stateEncoder";
import {
  createDraftLogger,
  mergeToJSONL,
  type DraftLogger,
} from "../lib/draftAI/neural/logger";
import type { Champion, Lane, AIDifficulty, Side } from "../lib/types";
import type { Archetype } from "../lib/championMeta";

// ─── Configuración ────────────────────────────────────────────────────────────

const DATASET_GAMES = parseInt(process.env.DATASET_GAMES ?? "1000", 10);
const DATASET_OUTPUT = process.env.DATASET_OUTPUT ?? "data/draft-dataset.jsonl";
const DATASET_APPEND = process.env.DATASET_APPEND === "true";
const LOG_INTERVAL = 100;

// Este script es el "profesor" de Behavior Cloning: SIEMPRE usa heurística.
// La red neuronal aprende a imitar las decisiones heurísticas; si usara
// neural para generar los datos de entrenamiento, el dataset estaría
// contaminado con las propias predicciones del modelo (covariate shift).
const FORCE_HEURISTIC_OPTS: AIActionOptions = { forceHeuristic: true };

// ─── Fetch de campeones (igual que calibrate.ts) ─────────────────────────────

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

// ─── Generador de números pseudoaleatorios (LCG simple) ─────────────────────

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Construir un SeriesAIContext mínimo para diversidad de datos ────────────

function makeMinimalSeriesCtx(
  difficulty: AIDifficulty,
  side: Side,
  rng: () => number,
): SeriesAIContext {
  const myWins = Math.floor(rng() * 3);
  const oppWins = Math.floor(rng() * 3);
  const winsBehind = myWins - oppWins;
  const fearless = rng() < 0.3;
  return {
    fearless,
    gameIndex: Math.floor(rng() * 5),
    totalGames: 5,
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
    eliminationGame: oppWins === 2 && myWins < 3,
    closeoutGame: myWins === 2 && oppWins < 3,
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

  let game = createGame(gameId, "BlueTeam", "RedTeam");
  const fearlessLocked = new Set<number>();

  // Construir contextos de serie para ambos lados
  const blueCtx = makeMinimalSeriesCtx(diff, "blue", rng);
  const redCtx = makeMinimalSeriesCtx(diff, "red", rng);

  const allIds = champions.map((c) => c.id);

  while (currentAction(game)) {
    const action = currentAction(game)!;
    const aiSide = action.side;
    const seriesCtx = aiSide === "blue" ? blueCtx : redCtx;

    // Codificar estado ANTES de aplicar la acción
    const stateVec = encodeDraftState(
      game,
      champions,
      champIndex,
      aiSide,
      fearlessLocked,
      seriesCtx,
    );

    // La IA heurística elige la acción (SIEMPRE — es el profesor de BC)
    const rationale = chooseAIActionWithRationale(
      game,
      champions,
      fearlessLocked,
      seriesCtx,
      rng,
      undefined,
      FORCE_HEURISTIC_OPTS,
    );

    if (!rationale) {
      // Timeout: usar el primer campeón disponible
      game = applyTimeout(game, allIds, fearlessLocked);
      continue;
    }

    const chosenId = rationale.championId;
    const slot = champIndex.idToSlot.get(chosenId);

    if (slot === undefined) {
      // Campeón no en el índice (no debería ocurrir)
      game = applyLock(game, chosenId);
      fearlessLocked.add(chosenId);
      continue;
    }

    // Registrar el turno
    logger.record(stateVec, slot, chosenId, action.kind, aiSide, {
      difficulty: diff,
      personalityId: rationale.personalityId,
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
    // finalizeRoles necesita un SeriesState para resolver roles — usar un stub mínimo
    const stubSeries = {
      bluePlayers: undefined,
      redPlayers: undefined,
    } as unknown as Parameters<typeof finalizeRoles>[2];
    finalGame = finalizeRoles(game, champions, stubSeries);
  } catch {
    // Si falla la asignación de roles, usar el juego tal cual
    finalGame = game;
  }

  // Simular resultado del partido
  const result = simulateMatch(finalGame, champions);
  const winner = result.winner; // "blue" | "red" | "draw"

  // Asignar outcome a todos los turnos del logger
  // Desde la perspectiva de blue: blue=win, red=loss
  // Para ambos lados mezclamos perspectiva en el side del record
  const records = logger.getRecords();
  // Necesitamos asignar outcome por-turno según el lado que actuó
  const adjustedRecords = logger.getRecords();
  // Reimplementar con outcome por-lado: reescribir outcome en los registros
  // después de setOutcome inicial con una segunda pasada
  // Usamos "win" si el lado que registró el turno ganó, "loss" si perdió
  // Para eso necesitamos que el logger seteé el outcome en todos, luego
  // ajustamos por side.
  // Como la API del logger solo tiene setOutcome global, usaremos "blue_win" context:
  // winner es "blue" → los turnos de blue son win, los de red son loss
  const outcomeForBlue: "win" | "loss" | "draw" =
    winner === "blue" ? "win" : winner === "red" ? "loss" : "draw";

  logger.setOutcome(outcomeForBlue); // Primero setear para todos
  // Luego ajustar turnos del lado rojo (invertir)
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

  // Asegurar que existe el directorio de salida
  const outDir = path.dirname(DATASET_OUTPUT);
  if (outDir && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const writeStream = fs.createWriteStream(DATASET_OUTPUT, {
    flags: DATASET_APPEND ? "a" : "w",
    encoding: "utf8",
  });

  console.log(
    `[dataset] Generando ${DATASET_GAMES} partidas → ${DATASET_OUTPUT}`,
  );

  let totalTurns = 0;
  const seed = parseInt(process.env.DATASET_SEED ?? String(Date.now()), 10);

  for (let i = 0; i < DATASET_GAMES; i++) {
    const rng = makeLCG(seed + i * 17239);
    const logger = simulateAndLogGame(i, champions, rng);
    const jsonl = logger.toJSONL();
    if (jsonl) {
      writeStream.write(jsonl + "\n");
      totalTurns += logger.getRecords().length;
    }

    if ((i + 1) % LOG_INTERVAL === 0) {
      console.log(
        `[dataset] ${i + 1}/${DATASET_GAMES} partidas — ${totalTurns} turnos acumulados`,
      );
    }
  }

  await new Promise<void>((res, rej) => {
    writeStream.end((err?: Error | null) => (err ? rej(err) : res()));
  });

  console.log(
    `[dataset] ✓ Completado: ${DATASET_GAMES} partidas, ${totalTurns} turnos → ${DATASET_OUTPUT}`,
  );
  console.log(
    `[dataset] Ejecuta el entrenamiento Python con: cd training && python train_bc.py`,
  );
}

main().catch((e) => {
  console.error("[dataset] Error:", e);
  process.exit(1);
});
