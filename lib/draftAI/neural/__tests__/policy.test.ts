import { describe, it, expect, beforeEach } from "vitest";
import {
  createNeuralPolicyFromWeights,
  type NeuralPolicyWeights,
} from "../policy";
import {
  CHAMPION_POOL_SIZE,
  STATE_DIM,
} from "../stateEncoder";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Construye un conjunto de pesos triviales: todo ceros excepto un solo bias. */
function makeZeroWeights(
  hiddenDims: number[],
  stateDim = STATE_DIM,
  numActions = CHAMPION_POOL_SIZE,
): NeuralPolicyWeights {
  function zeroLayer(inDim: number, outDim: number) {
    return {
      W: Array.from({ length: outDim }, () => new Array(inDim).fill(0)),
      b: new Array(outDim).fill(0),
    };
  }

  let inDim = stateDim;
  const layers = hiddenDims.map((hDim) => {
    const layer = zeroLayer(inDim, hDim);
    inDim = hDim;
    return layer;
  });

  return {
    version: 1,
    state_dim: stateDim,
    num_actions: numActions,
    hidden_dims: hiddenDims,
    layers,
    policy_head: zeroLayer(inDim, numActions),
  };
}

/** Construye pesos que asignan toda la probabilidad al slot dado. */
function makeTargetWeights(
  targetSlot: number,
  hiddenDims: number[] = [8, 8],
  stateDim = STATE_DIM,
  numActions = CHAMPION_POOL_SIZE,
): NeuralPolicyWeights {
  const weights = makeZeroWeights(hiddenDims, stateDim, numActions);
  // Bias muy alto en el targetSlot de la cabeza de política → logit dominante
  weights.policy_head.b[targetSlot] = 100;
  return weights;
}

// ─── Tests de policy ──────────────────────────────────────────────────────────

describe("createNeuralPolicyFromWeights", () => {
  it("devuelve una política con meta correcto", () => {
    const weights = makeZeroWeights([64, 32]);
    const policy = createNeuralPolicyFromWeights(weights);
    expect(policy.meta.stateDim).toBe(STATE_DIM);
    expect(policy.meta.numActions).toBe(CHAMPION_POOL_SIZE);
    expect(policy.meta.hiddenDims).toEqual([64, 32]);
    expect(policy.meta.hasValueHead).toBe(false);
  });

  it("detecta value head cuando está presente", () => {
    const weights = makeZeroWeights([32]);
    weights.value_head = {
      W: [[...new Array(32).fill(0)]],
      b: [0],
    };
    const policy = createNeuralPolicyFromWeights(weights);
    expect(policy.meta.hasValueHead).toBe(true);
  });
});

describe("NeuralPolicy.chooseAction", () => {
  it("elige el slot con bias más alto cuando está legal", () => {
    const targetSlot = 42;
    const weights = makeTargetWeights(targetSlot);
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1); // todos legales

    const result = policy.chooseAction(state, mask);
    expect(result.actionSlot).toBe(targetSlot);
  });

  it("nunca elige un slot ilegal aunque tenga el bias más alto", () => {
    const targetSlot = 42;
    const weights = makeTargetWeights(targetSlot);
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);
    // Bloquear exactamente el slot con mayor logit
    mask[targetSlot] = 0;

    const result = policy.chooseAction(state, mask);
    // El resultado no puede ser el slot ilegal
    expect(result.actionSlot).not.toBe(targetSlot);
    // El resultado debe ser un slot legal
    expect(mask[result.actionSlot]).toBe(1);
  });

  it("las probabilidades suman ≈ 1 sobre los slots legales", () => {
    const weights = makeZeroWeights([16, 8]);
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(0);
    // Solo 10 slots legales
    for (let i = 10; i < 20; i++) mask[i] = 1;

    const result = policy.chooseAction(state, mask);
    let sum = 0;
    for (const p of result.probs) sum += p;
    expect(sum).toBeCloseTo(1.0, 5);

    // Los slots ilegales tienen probabilidad 0
    for (let i = 0; i < 10; i++) expect(result.probs[i]).toBeCloseTo(0);
    for (let i = 20; i < CHAMPION_POOL_SIZE; i++) expect(result.probs[i]).toBeCloseTo(0);
  });

  it("es determinista: misma entrada → mismo resultado", () => {
    const weights = makeZeroWeights([32]);
    weights.policy_head.b[5] = 10;
    weights.policy_head.b[15] = 8;
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0.1);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);

    const r1 = policy.chooseAction(state, mask);
    const r2 = policy.chooseAction(state, mask);
    expect(r1.actionSlot).toBe(r2.actionSlot);
    expect(Array.from(r1.probs)).toEqual(Array.from(r2.probs));
  });

  it("elige el único slot legal cuando solo uno está disponible", () => {
    const weights = makeZeroWeights([16]);
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(0);
    mask[77] = 1; // Solo el slot 77 es legal

    const result = policy.chooseAction(state, mask);
    expect(result.actionSlot).toBe(77);
  });

  it("estima win probability cuando hay value head", () => {
    const weights = makeZeroWeights([16]);
    weights.value_head = {
      W: [new Array(16).fill(0)],
      b: [0], // sigmoid(0) = 0.5
    };
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);

    const result = policy.chooseAction(state, mask);
    expect(result.winProb).toBeDefined();
    expect(result.winProb).toBeCloseTo(0.5); // sigmoid(0) = 0.5
  });

  it("win prob no está definido sin value head", () => {
    const weights = makeZeroWeights([16]);
    const policy = createNeuralPolicyFromWeights(weights);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);

    const result = policy.chooseAction(state, mask);
    expect(result.winProb).toBeUndefined();
  });
});

describe("NeuralPolicy — forward pass con bias positivos", () => {
  it("rankings correctos con múltiples bias distintos", () => {
    const weights = makeZeroWeights([4, 4]);
    // Slots con bias diferentes en la cabeza de política
    weights.policy_head.b[10] = 5;  // slot 10 → debería ganar
    weights.policy_head.b[20] = 3;
    weights.policy_head.b[30] = 1;

    const policy = createNeuralPolicyFromWeights(weights);
    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);

    const result = policy.chooseAction(state, mask);
    expect(result.actionSlot).toBe(10);
    // La probabilidad del slot 10 debe ser mayor que la del 20
    expect(result.probs[10]).toBeGreaterThan(result.probs[20]);
    expect(result.probs[20]).toBeGreaterThan(result.probs[30]);
  });
});
