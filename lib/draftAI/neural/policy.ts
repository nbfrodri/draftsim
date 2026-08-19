// Inferencia pura TypeScript del modelo de política de draft.
//
// Carga los pesos exportados desde el pipeline Python (training/export.py) y
// ejecuta el forward pass del MLP sin dependencias externas.
//
// Carga de pesos:
//   - Browser: fetch('/models/draft-policy.json')
//   - Node.js: import dinámico de node:fs/promises (sin bundlear fs en el cliente)

import {
  CHAMPION_POOL_SIZE,
  STATE_DIM,
  type DraftStateVector,
} from "./stateEncoder";

function isBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof window.fetch === "function";
}

// ─── Tipos de pesos ─────────────────────────────────────────────────────────

interface DenseLayer {
  /** Matriz de pesos [out_dim × in_dim]. */
  W: readonly number[][];
  /** Vector de bias [out_dim]. */
  b: readonly number[];
}

export interface NeuralPolicyWeights {
  version: number;
  state_dim: number;
  num_actions: number;
  hidden_dims: number[];
  layers: DenseLayer[];
  policy_head: DenseLayer;
  value_head?: DenseLayer;
}

// ─── Forward pass puro TypeScript ───────────────────────────────────────────

/** Producto matriz-vector + bias. Devuelve un nuevo Float64Array. */
function linearForward(
  layer: DenseLayer,
  input: Float64Array | Float32Array,
): Float64Array {
  const outDim = layer.b.length;
  const out = new Float64Array(outDim);
  for (let o = 0; o < outDim; o++) {
    let sum = layer.b[o];
    const row = layer.W[o];
    for (let i = 0; i < input.length; i++) {
      sum += row[i] * input[i];
    }
    out[o] = sum;
  }
  return out;
}

/** ReLU in-place. */
function relu(x: Float64Array): Float64Array {
  for (let i = 0; i < x.length; i++) {
    if (x[i] < 0) x[i] = 0;
  }
  return x;
}

/** Sigmoid escalar. */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Softmax con substracción del máximo para estabilidad numérica.
 * Ignora slots con -Infinity (acciones ilegales).
 */
function maskedSoftmax(logits: Float64Array, mask: Uint8Array): Float64Array {
  let maxVal = -Infinity;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i] && logits[i] > maxVal) maxVal = logits[i];
  }

  const probs = new Float64Array(logits.length);
  let sumExp = 0;
  for (let i = 0; i < logits.length; i++) {
    if (mask[i]) {
      const e = Math.exp(logits[i] - maxVal);
      probs[i] = e;
      sumExp += e;
    }
  }

  if (sumExp > 0) {
    for (let i = 0; i < probs.length; i++) {
      probs[i] /= sumExp;
    }
  }

  return probs;
}

// ─── Interfaz pública ────────────────────────────────────────────────────────

export interface NeuralPolicyResult {
  /** Índice del campeón elegido en el pool ordenado por ID. */
  actionSlot: number;
  /** Probabilidades de política para todos los slots (post-mask + softmax). */
  probs: Float64Array;
  /** Estimación de probabilidad de victoria [0..1]. Undefined si no hay value head. */
  winProb?: number;
}

export interface NeuralPolicy {
  /**
   * Elige la acción con mayor probabilidad dado el estado y la máscara legal.
   *
   * @param stateVec   Vector de estado (Float32Array de longitud STATE_DIM).
   * @param legalMask  Máscara booleana de acciones legales (Uint8Array[CHAMPION_POOL_SIZE]).
   * @returns NeuralPolicyResult con el slot elegido y las probabilidades.
   */
  chooseAction(stateVec: DraftStateVector, legalMask: Uint8Array): NeuralPolicyResult;

  /** Metadata del modelo cargado. */
  readonly meta: {
    stateDim: number;
    numActions: number;
    hiddenDims: number[];
    hasValueHead: boolean;
  };
}

// ─── Implementación ─────────────────────────────────────────────────────────

function makeNeuralPolicy(weights: NeuralPolicyWeights): NeuralPolicy {
  if (weights.state_dim !== STATE_DIM) {
    console.warn(
      `[neuralPolicy] state_dim del modelo (${weights.state_dim}) no coincide ` +
        `con STATE_DIM del encoder (${STATE_DIM}). La inferencia puede ser incorrecta.`,
    );
  }
  if (weights.num_actions !== CHAMPION_POOL_SIZE) {
    console.warn(
      `[neuralPolicy] num_actions del modelo (${weights.num_actions}) no coincide ` +
        `con CHAMPION_POOL_SIZE (${CHAMPION_POOL_SIZE}). La inferencia puede ser incorrecta.`,
    );
  }

  return {
    chooseAction(stateVec: DraftStateVector, legalMask: Uint8Array): NeuralPolicyResult {
      // Trunk: capas densas con ReLU
      let hidden: Float64Array = new Float64Array(stateVec);
      for (const layer of weights.layers) {
        hidden = relu(linearForward(layer, hidden));
      }

      // Cabeza de política
      const logits = linearForward(weights.policy_head, hidden);

      // Aplicar máscara legal: poner -Infinity en slots ilegales
      for (let i = 0; i < logits.length; i++) {
        if (!legalMask[i]) logits[i] = -Infinity;
      }

      const probs = maskedSoftmax(logits, legalMask);

      // Elegir el slot con mayor probabilidad
      let bestSlot = -1;
      let bestProb = -1;
      for (let i = 0; i < probs.length; i++) {
        if (legalMask[i] && probs[i] > bestProb) {
          bestProb = probs[i];
          bestSlot = i;
        }
      }

      // Si no hay slot legal (no debería ocurrir), devolver el primero no-cero
      if (bestSlot < 0) {
        for (let i = 0; i < legalMask.length; i++) {
          if (legalMask[i]) { bestSlot = i; break; }
        }
      }

      const result: NeuralPolicyResult = { actionSlot: bestSlot, probs };

      // Cabeza de valor (opcional)
      if (weights.value_head) {
        const valueLogit = linearForward(weights.value_head, hidden);
        result.winProb = sigmoid(valueLogit[0]);
      }

      return result;
    },

    meta: {
      stateDim: weights.state_dim,
      numActions: weights.num_actions,
      hiddenDims: weights.hidden_dims,
      hasValueHead: !!weights.value_head,
    },
  };
}

// ─── Carga del modelo ────────────────────────────────────────────────────────

function parseNeuralPolicyWeights(raw: string): NeuralPolicy | null {
  try {
    const weights = JSON.parse(raw) as NeuralPolicyWeights;

    if (weights.version !== 1) {
      console.warn(`[neuralPolicy] Versión de pesos no soportada: ${weights.version}`);
      return null;
    }

    return makeNeuralPolicy(weights);
  } catch (e) {
    console.error("[neuralPolicy] Error parseando pesos JSON:", e);
    return null;
  }
}

async function readModelJson(source: string): Promise<string | null> {
  if (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("/")
  ) {
    const res = await fetch(source);
    if (!res.ok) return null;
    return res.text();
  }

  try {
    const fs = await import("node:fs/promises");
    return await fs.readFile(source, "utf8");
  } catch {
    return null;
  }
}

// Caché del modelo cargado (singleton por ruta).
let _cachedPolicy: NeuralPolicy | null = null;
let _cachedPolicyPath = "";

/**
 * Carga los pesos del modelo de forma asíncrona.
 *
 * - Browser / rutas web: `fetch('/models/draft-policy.json')`
 * - Node.js: `fs.readFile` en la ruta del sistema de archivos
 */
export async function loadNeuralPolicyAsync(
  weightsPath: string,
): Promise<NeuralPolicy | null> {
  if (_cachedPolicy && _cachedPolicyPath === weightsPath) {
    return _cachedPolicy;
  }

  let raw: string | null;
  try {
    raw = await readModelJson(weightsPath);
  } catch (e) {
    console.error(`[neuralPolicy] Error al descargar pesos desde ${weightsPath}:`, e);
    return null;
  }

  if (!raw) return null;

  const policy = parseNeuralPolicyWeights(raw);
  if (!policy) return null;

  _cachedPolicy = policy;
  _cachedPolicyPath = weightsPath;
  console.log(`[neuralPolicy] Modelo cargado desde ${weightsPath}`);
  return policy;
}

/**
 * Alias síncrono para scripts Node.js — delega en la ruta async.
 * En browser devuelve null inmediatamente.
 */
export function loadNeuralPolicy(weightsPath: string): NeuralPolicy | null {
  if (isBrowserRuntime()) return null;
  if (_cachedPolicy && _cachedPolicyPath === weightsPath) {
    return _cachedPolicy;
  }
  return null;
}

/**
 * Invalida el caché del modelo. Útil en tests o cuando los pesos cambian en
 * disco durante una sesión de desarrollo.
 */
export function invalidatePolicyCache(): void {
  _cachedPolicy = null;
  _cachedPolicyPath = "";
}

/**
 * Crea una política directamente desde un objeto de pesos (sin leer disco).
 * Útil para tests unitarios con pesos conocidos.
 */
export function createNeuralPolicyFromWeights(weights: NeuralPolicyWeights): NeuralPolicy {
  return makeNeuralPolicy(weights);
}
