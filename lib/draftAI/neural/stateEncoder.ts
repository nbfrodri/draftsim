// Serialización del estado del draft a un vector numérico de tamaño fijo.
//
// El vector tiene dos bloques:
//   1. SCALAR_DIMS floats de contexto global (índice de acción, fase, lado,
//      dificultad, contexto de serie, tiers de roster).
//   2. CHAMPION_POOL_SIZE × CHAMP_DIMS floats de características por campeón,
//      ordenados por ID de campeón ascendente y zero-padded hasta el máximo.
//
// El índice de campeón (buildChampionIndex) debe construirse UNA VEZ con la
// lista ordenada de campeones y reutilizarse para todas las codificaciones y
// en el pipeline de inferencia. Esto garantiza que el slot de cada campeón
// en el vector es estable entre entrenamiento e inferencia.
//
// Tamaño total del vector:
//   STATE_DIM = SCALAR_DIMS + CHAMPION_POOL_SIZE * CHAMP_DIMS
//             = 27           + 200               * 16
//             = 3227

import {
  getMetaTier,
  getSynergy,
  TIER_VALUE,
  type MetaTier,
} from "../../championMeta";
import type { Archetype } from "../../championMeta";
import { laneMatchup } from "../helpers";
import type { Champion, GameDraft, Lane, Side } from "../../types";
import type { SeriesAIContext } from "../index";
import type { PlayerTier } from "../../types";

// ─── Dimensiones fijas ───────────────────────────────────────────────────────

/** Número máximo de campeones en el pool (padding fijo). */
export const CHAMPION_POOL_SIZE = 200;
/** Features globales escalares al inicio del vector. */
export const SCALAR_DIMS = 27;
/** Features por campeón (slot en el pool). */
export const CHAMP_DIMS = 16;
/** Dimensión total del vector de estado. */
export const STATE_DIM = SCALAR_DIMS + CHAMPION_POOL_SIZE * CHAMP_DIMS;

/** Vector de estado de una acción del draft. Tipo alias por claridad. */
export type DraftStateVector = Float32Array;

// ─── Índice estable de campeones ─────────────────────────────────────────────

export interface EncoderChampionIndex {
  /** ID de campeón → índice de slot en el vector (0..N−1). */
  idToSlot: ReadonlyMap<number, number>;
  /** Slot → ID de campeón (para decodificar la acción del modelo). */
  slotToId: readonly number[];
  /** Slot → alias del campeón (para lookups de meta/sinergia). */
  slotToAlias: readonly string[];
  /** Campeones reales en el pool (≤ CHAMPION_POOL_SIZE). */
  poolSize: number;
}

/**
 * Construye el índice estable de campeones a partir de la lista del roster.
 * Los campeones se ordenan por ID ascendente para garantizar reproducibilidad
 * entre sesiones de entrenamiento e inferencia.
 *
 * Llamar UNA VEZ al inicio de cada sesión de entrenamiento/inferencia.
 */
export function buildChampionIndex(
  champions: readonly Champion[],
): EncoderChampionIndex {
  if (champions.length > CHAMPION_POOL_SIZE) {
    console.warn(
      `[stateEncoder] Pool de campeones (${champions.length}) excede CHAMPION_POOL_SIZE (${CHAMPION_POOL_SIZE}). ` +
        "Los campeones sobrantes se ignorarán.",
    );
  }
  const sorted = [...champions]
    .sort((a, b) => a.id - b.id)
    .slice(0, CHAMPION_POOL_SIZE);

  const idToSlot = new Map<number, number>();
  const slotToId: number[] = [];
  const slotToAlias: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    idToSlot.set(sorted[i].id, i);
    slotToId.push(sorted[i].id);
    slotToAlias.push(sorted[i].alias);
  }

  return { idToSlot, slotToId, slotToAlias, poolSize: sorted.length };
}

// ─── Helpers internos ────────────────────────────────────────────────────────

const POSITIONAL_LANES: readonly Lane[] = [
  "top",
  "jungle",
  "middle",
  "bottom",
  "support",
];

const TIER_NORM = TIER_VALUE["S+"]; // 6 — denominador para normalizar

const PLAYER_TIER_VALUE: Record<PlayerTier, number> = {
  "S+": 6,
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

function getPhaseIndex(actionIndex: number): 0 | 1 | 2 | 3 {
  if (actionIndex < 6) return 0; // Ban Phase 1
  if (actionIndex < 12) return 1; // Pick Phase 1
  if (actionIndex < 16) return 2; // Ban Phase 2
  return 3; // Pick Phase 2
}

// Suma de bonos de sinergia explícita del candidato con aliados ya elegidos.
function synergyScoreFor(
  candidate: Champion,
  myPickIds: (number | null)[],
  byId: ReadonlyMap<number, Champion>,
): number {
  let total = 0;
  for (const id of myPickIds) {
    if (id == null) continue;
    const ally = byId.get(id);
    if (!ally || ally.id === candidate.id) continue;
    const s = getSynergy(candidate.alias, ally.alias);
    if (s) total += s.bonus;
  }
  return Math.min(6, total);
}

// Suma de ventaja de matchup del candidato contra picks enemigos.
function counterScoreFor(
  candidate: Champion,
  enemyPickIds: (number | null)[],
  byId: ReadonlyMap<number, Champion>,
): number {
  let total = 0;
  for (const id of enemyPickIds) {
    if (id == null) continue;
    const enemy = byId.get(id);
    if (!enemy) continue;
    total += laneMatchup(candidate, enemy);
  }
  // laneMatchup range ≈ ±10 por par → max acum razonable ~50
  return total;
}

// ─── Función principal de codificación ──────────────────────────────────────

/**
 * Codifica el estado de un turno del draft a un Float32Array de tamaño fijo.
 *
 * @param game       Estado actual del draft.
 * @param champions  Lista completa de campeones del roster (estable en sesión).
 * @param champIndex Índice construido con buildChampionIndex.
 * @param aiSide     Lado que está tomando la decisión en este turno.
 * @param fearlessLocked IDs bloqueados por modo fearless.
 * @param seriesCtx  Contexto de serie (opcional; zeros si no se provee).
 * @returns Float32Array de longitud STATE_DIM.
 */
export function encodeDraftState(
  game: GameDraft,
  champions: readonly Champion[],
  champIndex: EncoderChampionIndex,
  aiSide: Side,
  fearlessLocked: ReadonlySet<number>,
  seriesCtx?: SeriesAIContext,
): DraftStateVector {
  const vec = new Float32Array(STATE_DIM);
  const byId = new Map(champions.map((c) => [c.id, c]));

  // ── Bloque escalar (índices 0..SCALAR_DIMS−1) ─────────────────────────────

  let s = 0;

  // 0: índice de acción normalizado
  vec[s++] = game.actionIndex / 19;

  // 1-4: fase one-hot [ban1, pick1, ban2, pick2]
  const phaseIdx = getPhaseIndex(game.actionIndex);
  vec[s + phaseIdx] = 1;
  s += 4;

  // 5-6: lado [isBlue, isRed]
  vec[s++] = aiSide === "blue" ? 1 : 0;
  vec[s++] = aiSide === "red" ? 1 : 0;

  // 7-9: dificultad one-hot [easy, normal, hard]
  const diff = seriesCtx?.difficulty ?? "normal";
  vec[s++] = diff === "easy" ? 1 : 0;
  vec[s++] = diff === "normal" ? 1 : 0;
  vec[s++] = diff === "hard" ? 1 : 0;

  // 10: fearless mode
  vec[s++] = seriesCtx?.fearless ? 1 : 0;

  // 11: índice de juego normalizado dentro de la serie
  const totalGames = seriesCtx?.totalGames ?? 1;
  const gameIndex = seriesCtx?.gameIndex ?? 0;
  vec[s++] = totalGames > 1 ? gameIndex / (totalGames - 1) : 0;

  // 12-14: puntuación de la serie
  const myWins = seriesCtx?.myWins ?? 0;
  const oppWins = seriesCtx?.oppWins ?? 0;
  const winsBehind = seriesCtx?.winsBehind ?? 0;
  // Normalizar sobre 3 (máximo en BO5)
  vec[s++] = myWins / 3;
  vec[s++] = oppWins / 3;
  vec[s++] = winsBehind / 3;

  // 15: juego de eliminación
  vec[s++] = seriesCtx?.eliminationGame ? 1 : 0;

  // 16: juego de cierre
  vec[s++] = seriesCtx?.closeoutGame ? 1 : 0;

  // 17-21: tier del roster propio por lane [top, jg, mid, bot, sup]
  const myPlayers = seriesCtx?.myPlayers;
  for (let lane = 0; lane < 5; lane++) {
    const player = myPlayers?.[lane];
    vec[s++] = player ? PLAYER_TIER_VALUE[player.tier] / TIER_NORM : 0.5;
  }

  // 22-26: tier del roster rival por lane [top, jg, mid, bot, sup]
  const oppPlayers = seriesCtx?.oppPlayers;
  for (let lane = 0; lane < 5; lane++) {
    const player = oppPlayers?.[lane];
    vec[s++] = player ? PLAYER_TIER_VALUE[player.tier] / TIER_NORM : 0.5;
  }

  // Verificación de que el offset escalar es correcto
  // (s debe ser exactamente SCALAR_DIMS aquí)

  // ── Bloque por campeón ────────────────────────────────────────────────────

  // Pre-computar conjuntos de IDs usados para lookup O(1)
  const blueBanSet = new Set(game.blueBans.filter((x): x is number => x != null));
  const redBanSet = new Set(game.redBans.filter((x): x is number => x != null));
  const bluePickSet = new Set(game.bluePicks.filter((x): x is number => x != null));
  const redPickSet = new Set(game.redPicks.filter((x): x is number => x != null));
  const usedSet = new Set([
    ...blueBanSet,
    ...redBanSet,
    ...bluePickSet,
    ...redPickSet,
  ]);

  // Picks del lado AI y del rival para sinergia/counter
  const myPickIds: (number | null)[] =
    aiSide === "blue" ? game.bluePicks : game.redPicks;
  const enemyPickIds: (number | null)[] =
    aiSide === "blue" ? game.redPicks : game.bluePicks;

  // Pool de campeones buenos/malos del roster (para features de confort)
  const myGoodPool = new Set<number>();
  const myBadPool = new Set<number>();
  const oppGoodPool = new Set<number>();

  if (myPlayers) {
    for (const p of myPlayers) {
      for (const id of p.goodChamps) myGoodPool.add(id);
      for (const id of p.badChamps) myBadPool.add(id);
    }
  }
  if (oppPlayers) {
    for (const p of oppPlayers) {
      for (const id of p.goodChamps) oppGoodPool.add(id);
    }
  }

  // Escribir features por campeón
  for (let slot = 0; slot < champIndex.poolSize; slot++) {
    const champId = champIndex.slotToId[slot];
    const champ = byId.get(champId);
    const base = SCALAR_DIMS + slot * CHAMP_DIMS;

    if (!champ) {
      // Slot de padding — todo ceros
      continue;
    }

    // 0-3: board state
    vec[base + 0] = blueBanSet.has(champId) ? 1 : 0;
    vec[base + 1] = redBanSet.has(champId) ? 1 : 0;
    vec[base + 2] = bluePickSet.has(champId) ? 1 : 0;
    vec[base + 3] = redPickSet.has(champId) ? 1 : 0;

    // 4: acción legal (ni usado ni bloqueado por fearless)
    vec[base + 4] = !usedSet.has(champId) && !fearlessLocked.has(champId) ? 1 : 0;

    // 5-9: meta tier por lane [top, jg, mid, bot, sup] normalizado
    for (let li = 0; li < 5; li++) {
      const lane = POSITIONAL_LANES[li];
      const tier = getMetaTier(champ.alias, lane);
      vec[base + 5 + li] = tier ? TIER_VALUE[tier] / TIER_NORM : 0;
    }

    // 10: ¿está en el pool de buenos campeones del roster propio?
    vec[base + 10] = myGoodPool.has(champId) ? 1 : 0;

    // 11: ¿está en el pool de buenos campeones del rival?
    vec[base + 11] = oppGoodPool.has(champId) ? 1 : 0;

    // 12: ¿está en el pool de malos campeones del roster propio?
    vec[base + 12] = myBadPool.has(champId) ? 1 : 0;

    // 13: sinergia acumulada con los picks ya elegidos del lado AI (norm /6)
    vec[base + 13] = synergyScoreFor(champ, myPickIds, byId) / 6;

    // 14: ventaja de counter vs picks enemigos ya elegidos (norm /30)
    // Rango de laneMatchup ≈ ±10 por par, con hasta 5 enemigos → ±50.
    // Dividir por 30 centra el valor útil alrededor de 0 con margen.
    vec[base + 14] = counterScoreFor(champ, enemyPickIds, byId) / 30;

    // 15: win rate en torneo (0..1), 0.5 si no se conoce
    const twr = seriesCtx?.tournamentChampionWR?.get(champId);
    vec[base + 15] = twr != null ? twr.winRate : 0.5;
  }

  // Slots de padding [poolSize..CHAMPION_POOL_SIZE−1] ya son 0 por Float32Array

  return vec;
}

/**
 * Devuelve una máscara booleana de acciones legales indexada por slot del pool.
 * Útil para el pipeline de inferencia que necesita la máscara por separado.
 */
export function buildLegalMask(
  game: GameDraft,
  champIndex: EncoderChampionIndex,
  fearlessLocked: ReadonlySet<number>,
): Uint8Array {
  const mask = new Uint8Array(CHAMPION_POOL_SIZE);
  const usedSet = new Set<number>([
    ...game.blueBans.filter((x): x is number => x != null),
    ...game.redBans.filter((x): x is number => x != null),
    ...game.bluePicks.filter((x): x is number => x != null),
    ...game.redPicks.filter((x): x is number => x != null),
  ]);

  for (let slot = 0; slot < champIndex.poolSize; slot++) {
    const id = champIndex.slotToId[slot];
    mask[slot] = !usedSet.has(id) && !fearlessLocked.has(id) ? 1 : 0;
  }
  return mask;
}
