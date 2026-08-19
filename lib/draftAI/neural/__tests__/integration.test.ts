// Test de integración: verifica que la IA heurística existente sigue
// funcionando correctamente cuando no hay modelo neural en disco,
// y que la integración neural no rompe el comportamiento por defecto.

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  chooseAIAction,
  chooseAIActionWithRationale,
} from "../../index";
import {
  injectNeuralPolicy,
  resetNeuralDraftPolicy,
  isNeuralPolicyLoaded,
} from "../index";
import { createNeuralPolicyFromWeights, type NeuralPolicyWeights } from "../policy";
import { CHAMPION_POOL_SIZE, STATE_DIM } from "../stateEncoder";
import { createGame, applyLock } from "../../../draftEngine";
import type { Champion, Lane } from "../../../types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeChamp(
  id: number,
  alias: string,
  roles: string[],
  lanes: Lane[],
): Champion {
  return { id, name: alias, alias, roles, lanes, iconUrl: "" };
}

// Pool de 25 campeones — un draft usa 20 en total (10 bans + 10 picks)
const CHAMPS: Champion[] = [
  makeChamp(1,  "Yasuo",    ["Fighter", "Assassin"], ["middle", "top"]),
  makeChamp(2,  "Malphite", ["Tank", "Fighter"],     ["top"]),
  makeChamp(3,  "Lulu",     ["Support"],             ["support"]),
  makeChamp(4,  "Jinx",     ["Marksman"],            ["bottom"]),
  makeChamp(5,  "Graves",   ["Assassin", "Fighter"], ["jungle"]),
  makeChamp(6,  "Thresh",   ["Support"],             ["support"]),
  makeChamp(7,  "Ahri",     ["Mage", "Assassin"],    ["middle"]),
  makeChamp(8,  "Darius",   ["Fighter", "Tank"],     ["top"]),
  makeChamp(9,  "Caitlyn",  ["Marksman"],            ["bottom"]),
  makeChamp(10, "LeeSin",   ["Fighter", "Assassin"], ["jungle"]),
  makeChamp(11, "Zed",      ["Assassin"],            ["middle"]),
  makeChamp(12, "Nautilus", ["Tank"],                ["support"]),
  makeChamp(13, "Vayne",    ["Marksman"],            ["bottom"]),
  makeChamp(14, "Renekton", ["Fighter"],             ["top"]),
  makeChamp(15, "Elise",    ["Mage", "Fighter"],     ["jungle"]),
  makeChamp(16, "Syndra",   ["Mage"],                ["middle"]),
  makeChamp(17, "Orianna",  ["Mage"],                ["middle"]),
  makeChamp(18, "Janna",    ["Support"],             ["support"]),
  makeChamp(19, "Ezreal",   ["Marksman"],            ["bottom"]),
  makeChamp(20, "Camille",  ["Fighter"],             ["top"]),
  makeChamp(21, "Viego",    ["Fighter", "Assassin"], ["jungle"]),
  makeChamp(22, "Akali",    ["Assassin"],            ["middle", "top"]),
  makeChamp(23, "Xayah",    ["Marksman"],            ["bottom"]),
  makeChamp(24, "Rakan",    ["Support"],             ["support"]),
  makeChamp(25, "Garen",    ["Fighter", "Tank"],     ["top"]),
];

// Pesos que asignan toda la probabilidad al slot 0 (el campeón de menor ID)
function makeDeterministicWeights(): NeuralPolicyWeights {
  function zeroLayer(inDim: number, outDim: number) {
    return {
      W: Array.from({ length: outDim }, () => new Array(inDim).fill(0)),
      b: new Array(outDim).fill(0),
    };
  }
  const hidden = [32, 16];
  let inDim = STATE_DIM;
  const layers = hidden.map((h) => {
    const l = zeroLayer(inDim, h);
    inDim = h;
    return l;
  });
  const policyHead = zeroLayer(inDim, CHAMPION_POOL_SIZE);
  // Bias máximo en slot 0 → campeón con menor ID
  policyHead.b[0] = 100;
  return { version: 1, state_dim: STATE_DIM, num_actions: CHAMPION_POOL_SIZE, hidden_dims: hidden, layers, policy_head: policyHead };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  resetNeuralDraftPolicy();
});

describe("Integración — sin modelo neural (fallback heurístico)", () => {
  it("chooseAIAction devuelve un ID válido sin modelo", () => {
    // Sin inyectar modelo, la IA heurística debe funcionar
    const game = createGame(1, "Blue", "Red");
    const result = chooseAIAction(game, CHAMPS, new Set());
    expect(typeof result).toBe("number");
    expect(CHAMPS.some((c) => c.id === result)).toBe(true);
  });

  it("chooseAIActionWithRationale devuelve rationale sin modelo", () => {
    const game = createGame(1, "Blue", "Red");
    const rationale = chooseAIActionWithRationale(game, CHAMPS, new Set());
    expect(rationale).not.toBeNull();
    expect(rationale!.kind).toBe("ban"); // primer turno es ban
    expect(typeof rationale!.championId).toBe("number");
  });

  it("completa un draft de 20 turnos sin modelo (solo heurística)", () => {
    let game = createGame(1, "Blue", "Red");
    const used = new Set<number>();
    let turnCount = 0;

    while (turnCount < 20) {
      const id = chooseAIAction(game, CHAMPS, used);
      if (id == null) break;
      game = applyLock(game, id);
      used.add(id);
      turnCount++;
    }

    expect(turnCount).toBe(20);
    expect(game.actionIndex).toBe(20);
  });
});

describe("Integración — con modelo neural inyectado", () => {
  it("isNeuralPolicyLoaded es false antes de inyectar", () => {
    expect(isNeuralPolicyLoaded()).toBe(false);
  });

  it("isNeuralPolicyLoaded es true después de inyectar", () => {
    injectNeuralPolicy(CHAMPS, makeDeterministicWeights());
    expect(isNeuralPolicyLoaded()).toBe(true);
  });

  it("chooseAIAction usa el modelo neural cuando está inyectado", () => {
    injectNeuralPolicy(CHAMPS, makeDeterministicWeights());
    const game = createGame(1, "Blue", "Red");
    const result = chooseAIAction(game, CHAMPS, new Set());
    // El modelo tiene bias máximo en slot 0 → campeón con menor ID (Yasuo, ID=1)
    expect(result).toBe(1);
  });

  it("chooseAIActionWithRationale devuelve rationale neural", () => {
    injectNeuralPolicy(CHAMPS, makeDeterministicWeights());
    const game = createGame(1, "Blue", "Red");
    const rationale = chooseAIActionWithRationale(game, CHAMPS, new Set());
    expect(rationale).not.toBeNull();
    expect(rationale!.championId).toBe(1); // Yasuo (slot 0)
  });

  it("resetNeuralDraftPolicy desactiva el modelo", () => {
    injectNeuralPolicy(CHAMPS, makeDeterministicWeights());
    expect(isNeuralPolicyLoaded()).toBe(true);
    resetNeuralDraftPolicy();
    expect(isNeuralPolicyLoaded()).toBe(false);
  });

  it("no elige campeones ilegales aunque tengan el mayor bias", () => {
    injectNeuralPolicy(CHAMPS, makeDeterministicWeights());
    // Yasuo (ID=1, slot=0) ya está baneado
    const game = {
      ...createGame(1, "Blue", "Red"),
      // Ya pasamos ban phase artificialmente (actionIndex=6 → primer pick)
      actionIndex: 6,
      blueBans: [1, 2, 3, null, null], // Yasuo, Malphite, Lulu baneados
      redBans: [4, 5, 6, null, null],  // Jinx, Graves, Thresh baneados
    };
    const fearlessLocked = new Set<number>();
    const result = chooseAIAction(game, CHAMPS, fearlessLocked);

    // El campeón elegido no debe estar baneado
    const banned = new Set([1, 2, 3, 4, 5, 6]);
    expect(result).not.toBeNull();
    expect(banned.has(result!)).toBe(false);
  });

  it("completa un draft de 20 turnos con modelo neural", () => {
    injectNeuralPolicy(CHAMPS, makeDeterministicWeights());
    let game = createGame(1, "Blue", "Red");
    const used = new Set<number>();
    let turnCount = 0;

    while (turnCount < 20) {
      const id = chooseAIAction(game, CHAMPS, used);
      if (id == null) break;
      game = applyLock(game, id);
      used.add(id);
      turnCount++;
    }

    expect(turnCount).toBe(20);
    // Cada acción elegida debe ser única (no repetición)
    expect(used.size).toBe(20);
  });
});
