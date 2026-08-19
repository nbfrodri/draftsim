// Tests de carga asíncrona del modelo neural (fetch-based).
//
// Cubre:
//   loadNeuralPolicyAsync  — lectura vía fetch (browser/Tauri)
//   initNeuralDraftPolicyAsync — integración con el estado del módulo
//
// fetch se mockea con vi.stubGlobal para evitar I/O real.
// NEURAL_DRAFT_DISABLED se elimina temporalmente en los tests de init.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  loadNeuralPolicyAsync,
  invalidatePolicyCache,
  type NeuralPolicyWeights,
} from "../policy";
import {
  initNeuralDraftPolicyAsync,
  resetNeuralDraftPolicy,
  isNeuralPolicyLoaded,
} from "../index";
import { STATE_DIM, CHAMPION_POOL_SIZE } from "../stateEncoder";
import type { Champion, Lane } from "../../../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMinimalWeights(targetSlot = 0): NeuralPolicyWeights {
  const weights: NeuralPolicyWeights = {
    version: 1,
    state_dim: STATE_DIM,
    num_actions: CHAMPION_POOL_SIZE,
    hidden_dims: [8],
    layers: [
      {
        W: Array.from({ length: 8 }, () => new Array(STATE_DIM).fill(0)),
        b: new Array(8).fill(0),
      },
    ],
    policy_head: {
      W: Array.from({ length: CHAMPION_POOL_SIZE }, () => new Array(8).fill(0)),
      b: new Array(CHAMPION_POOL_SIZE).fill(0),
    },
  };
  // Bias dominante en targetSlot → resultado determinista
  weights.policy_head.b[targetSlot] = 100;
  return weights;
}

function makeFetchMock(weights: NeuralPolicyWeights | null, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    text: async () => JSON.stringify(weights),
  });
}

function makeChamp(id: number): Champion {
  return { id, name: `Champ${id}`, alias: `champ${id}`, roles: [], lanes: [] as Lane[], iconUrl: "" };
}

const CHAMPS: Champion[] = Array.from({ length: 10 }, (_, i) => makeChamp(i + 1));

const MODEL_URL = "http://test.local/draft-policy.json";

afterEach(() => {
  vi.unstubAllGlobals();
  invalidatePolicyCache();
  resetNeuralDraftPolicy();
});

// ─── loadNeuralPolicyAsync ────────────────────────────────────────────────────

describe("loadNeuralPolicyAsync", () => {
  it("carga el modelo y devuelve política cuando la URL es válida", async () => {
    vi.stubGlobal("fetch", makeFetchMock(makeMinimalWeights()));

    const policy = await loadNeuralPolicyAsync(MODEL_URL);

    expect(policy).not.toBeNull();
    expect(policy!.meta.stateDim).toBe(STATE_DIM);
    expect(policy!.meta.numActions).toBe(CHAMPION_POOL_SIZE);
    expect(policy!.meta.hiddenDims).toEqual([8]);
    expect(policy!.meta.hasValueHead).toBe(false);
  });

  it("la política devuelta puede ejecutar inferencia sin error", async () => {
    vi.stubGlobal("fetch", makeFetchMock(makeMinimalWeights(42)));

    const policy = await loadNeuralPolicyAsync(MODEL_URL);
    expect(policy).not.toBeNull();

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);
    const result = policy!.chooseAction(state, mask);

    expect(result.actionSlot).toBe(42);
    expect(result.probs).toHaveLength(CHAMPION_POOL_SIZE);
    let sum = 0;
    for (const p of result.probs) sum += p;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("retorna null cuando la respuesta HTTP es 404", async () => {
    vi.stubGlobal("fetch", makeFetchMock(null, 404));

    const policy = await loadNeuralPolicyAsync(MODEL_URL);
    expect(policy).toBeNull();
  });

  it("retorna null cuando fetch lanza excepción (red caída)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const policy = await loadNeuralPolicyAsync(MODEL_URL);
    expect(policy).toBeNull();
  });

  it("retorna null cuando la versión del modelo no es 1", async () => {
    const badWeights = { ...makeMinimalWeights(), version: 99 };
    vi.stubGlobal("fetch", makeFetchMock(badWeights as NeuralPolicyWeights));

    const policy = await loadNeuralPolicyAsync(MODEL_URL);
    expect(policy).toBeNull();
  });

  it("reutiliza caché en segunda llamada con la misma URL (no vuelve a hacer fetch)", async () => {
    const mockFetch = makeFetchMock(makeMinimalWeights());
    vi.stubGlobal("fetch", mockFetch);

    const p1 = await loadNeuralPolicyAsync(MODEL_URL);
    const p2 = await loadNeuralPolicyAsync(MODEL_URL);

    expect(p1).toBe(p2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("hace fetch nuevamente para URL diferente (caché por URL)", async () => {
    const mockFetch = makeFetchMock(makeMinimalWeights());
    vi.stubGlobal("fetch", mockFetch);

    await loadNeuralPolicyAsync(MODEL_URL);
    await loadNeuralPolicyAsync("http://test.local/other-model.json");

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("detecta value head cuando está presente en los pesos", async () => {
    const weights = makeMinimalWeights();
    weights.value_head = {
      W: [new Array(8).fill(0)],
      b: [0],
    };
    vi.stubGlobal("fetch", makeFetchMock(weights));

    const policy = await loadNeuralPolicyAsync(MODEL_URL);
    expect(policy).not.toBeNull();
    expect(policy!.meta.hasValueHead).toBe(true);

    const state = new Float32Array(STATE_DIM).fill(0);
    const mask = new Uint8Array(CHAMPION_POOL_SIZE).fill(1);
    const result = policy!.chooseAction(state, mask);
    expect(result.winProb).toBeDefined();
    expect(result.winProb).toBeCloseTo(0.5); // sigmoid(0) = 0.5
  });
});

// ─── initNeuralDraftPolicyAsync ───────────────────────────────────────────────

describe("initNeuralDraftPolicyAsync", () => {
  // Suspender la flag de test para que initNeuralDraftPolicyAsync no salga temprano.
  beforeEach(() => {
    delete process.env.NEURAL_DRAFT_DISABLED;
  });
  afterEach(() => {
    process.env.NEURAL_DRAFT_DISABLED = "1";
  });

  it("devuelve true e isNeuralPolicyLoaded cuando el modelo carga OK", async () => {
    vi.stubGlobal("fetch", makeFetchMock(makeMinimalWeights()));

    const ok = await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);

    expect(ok).toBe(true);
    expect(isNeuralPolicyLoaded()).toBe(true);
  });

  it("devuelve false y la política no está lista cuando el fetch falla (404)", async () => {
    vi.stubGlobal("fetch", makeFetchMock(null, 404));

    const ok = await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);

    expect(ok).toBe(false);
    expect(isNeuralPolicyLoaded()).toBe(false);
  });

  it("devuelve false cuando fetch lanza excepción", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const ok = await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);

    expect(ok).toBe(false);
    expect(isNeuralPolicyLoaded()).toBe(false);
  });

  it("segunda llamada con mismos campeones no repite el fetch (idempotente)", async () => {
    const mockFetch = makeFetchMock(makeMinimalWeights());
    vi.stubGlobal("fetch", mockFetch);

    await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);
    await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("devuelve false cuando NEURAL_DRAFT_DISABLED está activo", async () => {
    process.env.NEURAL_DRAFT_DISABLED = "1";
    const mockFetch = makeFetchMock(makeMinimalWeights());
    vi.stubGlobal("fetch", mockFetch);

    const ok = await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);

    expect(ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("resetNeuralDraftPolicy permite reinicializar y cargar de nuevo", async () => {
    const mockFetch = makeFetchMock(makeMinimalWeights());
    vi.stubGlobal("fetch", mockFetch);

    await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);
    expect(isNeuralPolicyLoaded()).toBe(true);

    resetNeuralDraftPolicy();
    expect(isNeuralPolicyLoaded()).toBe(false);

    await initNeuralDraftPolicyAsync(CHAMPS, MODEL_URL);
    expect(isNeuralPolicyLoaded()).toBe(true);
    // Dos fetches: caché de policy.ts también se limpió con resetNeuralDraftPolicy
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
