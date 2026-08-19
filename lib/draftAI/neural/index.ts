// Punto de entrada público del sistema de inferencia neural para el draft.
//
// Expone `chooseNeuralDraftAction` con la misma firma compatible que la IA
// heurística, y `initNeuralDraftPolicy` para cargar el modelo al inicio.
//
// Re-exporta también los tipos del encoder y del logger para que los
// consumidores externos (tests, scripts) importen desde un único módulo.

// path se usa solo en Node.js; en browser resolveModelPath devuelve string vacío.
function tryResolvePath(...segments: string[]): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodePath = require("path") as typeof import("path");
    return nodePath.resolve(...segments);
  } catch {
    return "";
  }
}
import { currentAction, usedChampionsInGame } from "../../draftEngine";
import type { Champion, GameDraft, Side } from "../../types";
import type { RNG } from "../../rng";
import type { DraftPersonality } from "../personalities";
import type { SeriesAIContext } from "../index";
import type { AIRationale } from "../index";
import {
  buildChampionIndex,
  buildLegalMask,
  encodeDraftState,
  type EncoderChampionIndex,
} from "./stateEncoder";
import {
  loadNeuralPolicy,
  invalidatePolicyCache,
  createNeuralPolicyFromWeights,
  type NeuralPolicy,
  type NeuralPolicyWeights,
} from "./policy";

// ─── Configuración de ruta del modelo ────────────────────────────────────────

/**
 * Ruta por defecto al JSON de pesos del modelo.
 *
 * Orden de resolución:
 *   1. Variable de entorno NEURAL_DRAFT_MODEL_PATH
 *   2. public/models/draft-policy.json (relativo a la raíz del proyecto)
 */
function resolveModelPath(): string {
  if (process.env.NEURAL_DRAFT_MODEL_PATH) {
    return process.env.NEURAL_DRAFT_MODEL_PATH;
  }
  // Relativo a este archivo: lib/draftAI/neural/ → ../../../public/models/
  return tryResolvePath(__dirname, "../../../public/models/draft-policy.json");
}

// ─── Estado del módulo ───────────────────────────────────────────────────────

let _policy: NeuralPolicy | null = null;
let _champIndex: EncoderChampionIndex | null = null;
let _champIndexChampions: Champion[] | null = null;
let _initialized = false;

// ─── Inicialización ──────────────────────────────────────────────────────────

/**
 * Carga el modelo de pesos y construye el índice de campeones.
 *
 * Debe llamarse UNA VEZ antes de `chooseNeuralDraftAction`. La función es
 * idempotente: si ya está inicializado con los mismos campeones, no hace nada.
 *
 * @param champions Lista completa del roster (estable durante la sesión).
 * @param modelPath Ruta al JSON de pesos (optional, usa resolveModelPath por defecto).
 * @returns true si el modelo fue cargado exitosamente, false si no existe.
 */
export function initNeuralDraftPolicy(
  champions: Champion[],
  modelPath?: string,
): boolean {
  const resolvedPath = modelPath ?? resolveModelPath();

  // Re-inicializar si los campeones cambian (e.g., entre tests)
  if (_initialized && _champIndexChampions === champions) {
    return _policy !== null;
  }

  _champIndex = buildChampionIndex(champions);
  _champIndexChampions = champions;
  _policy = loadNeuralPolicy(resolvedPath);
  _initialized = true;

  if (_policy) {
    console.log(
      `[neuralDraft] Política neural activa — ` +
        `${_champIndex.poolSize} campeones, dim=${_policy.meta.stateDim}`,
    );
  } else {
    console.log(
      `[neuralDraft] Modelo no encontrado en ${resolvedPath}. ` +
        `Usando IA heurística como fallback.`,
    );
  }

  return _policy !== null;
}

/**
 * Inyecta una política neural directamente (sin leer disco).
 * Pensado para tests unitarios con pesos conocidos.
 */
export function injectNeuralPolicy(
  champions: Champion[],
  weights: NeuralPolicyWeights,
): void {
  _champIndex = buildChampionIndex(champions);
  _champIndexChampions = champions;
  _policy = createNeuralPolicyFromWeights(weights);
  _initialized = true;
}

/** Descarga la política y libera recursos. Útil para tests. */
export function resetNeuralDraftPolicy(): void {
  _policy = null;
  _champIndex = null;
  _champIndexChampions = null;
  _initialized = false;
  invalidatePolicyCache();
}

/** Devuelve true si la política neural está cargada y lista. */
export function isNeuralPolicyLoaded(): boolean {
  return _policy !== null;
}

// ─── Función principal de decisión ──────────────────────────────────────────

/**
 * Elige la acción del draft usando la red neuronal.
 *
 * Si el modelo no está cargado (devuelve null), el caller (lib/draftAI/index.ts)
 * debe caer de vuelta a la IA heurística.
 *
 * La firma es compatible con chooseAIAction / chooseAIActionWithRationale para
 * que la integración en index.ts sea mínima.
 *
 * @returns El ID de campeón elegido, o null si no hay modelo o no hay acción válida.
 */
export function chooseNeuralDraftAction(
  game: GameDraft,
  champions: Champion[],
  fearlessLocked: ReadonlySet<number>,
  seriesCtx?: SeriesAIContext,
  _rng: RNG = Math.random,
  _personality?: DraftPersonality,
): number | null {
  if (!_policy || !_champIndex) return null;

  const action = currentAction(game);
  if (!action) return null;

  // Asegurar que el índice de campeones corresponde a la lista actual
  if (_champIndexChampions !== champions) {
    _champIndex = buildChampionIndex(champions);
    _champIndexChampions = champions;
  }

  const aiSide: Side = action.side;

  // Codificar estado
  const stateVec = encodeDraftState(
    game,
    champions,
    _champIndex,
    aiSide,
    fearlessLocked,
    seriesCtx,
  );

  // Construir máscara legal
  const legalMask = buildLegalMask(game, _champIndex, fearlessLocked);

  // Verificar que hay al menos una acción legal
  let hasLegal = false;
  for (let i = 0; i < legalMask.length; i++) {
    if (legalMask[i]) { hasLegal = true; break; }
  }
  if (!hasLegal) return null;

  // Inferencia
  const result = _policy.chooseAction(stateVec, legalMask);

  // Convertir slot → ID de campeón
  const champId = _champIndex.slotToId[result.actionSlot];
  if (champId == null) return null;

  return champId;
}

/**
 * Variante con rationale mínimo para la integración en chooseAIActionWithRationale.
 * Devuelve un AIRationale con los campos requeridos por la UI.
 * Los componentes de score son vacíos (la red no produce un breakdown explícito).
 */
export function chooseNeuralDraftActionWithRationale(
  game: GameDraft,
  champions: Champion[],
  fearlessLocked: ReadonlySet<number>,
  seriesCtx?: SeriesAIContext,
  rng: RNG = Math.random,
  personality?: DraftPersonality,
): AIRationale | null {
  const championId = chooseNeuralDraftAction(
    game,
    champions,
    fearlessLocked,
    seriesCtx,
    rng,
    personality,
  );
  if (championId == null) return null;

  const action = currentAction(game);
  if (!action) return null;

  return {
    kind: action.kind,
    championId,
    intendedLane: null,
    components: [{ label: "Neural policy", value: 1.0 }],
    total: 1.0,
    identityLabel: null,
    alternatives: [],
  };
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export {
  buildChampionIndex,
  encodeDraftState,
  buildLegalMask,
  STATE_DIM,
  CHAMPION_POOL_SIZE,
  SCALAR_DIMS,
  CHAMP_DIMS,
} from "./stateEncoder";
export type { DraftStateVector, EncoderChampionIndex } from "./stateEncoder";
export { createDraftLogger, mergeToJSONL } from "./logger";
export type { DraftLogger, DraftTurnRecord, TurnMetadata, MatchOutcome } from "./logger";
export type { NeuralPolicy, NeuralPolicyWeights, NeuralPolicyResult } from "./policy";
