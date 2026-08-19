import { describe, it, expect, beforeEach } from "vitest";
import {
  buildChampionIndex,
  encodeDraftState,
  buildLegalMask,
  STATE_DIM,
  SCALAR_DIMS,
  CHAMP_DIMS,
  CHAMPION_POOL_SIZE,
} from "../stateEncoder";
import { createGame } from "../../../draftEngine";
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

const Yasuo = makeChamp(1, "Yasuo", ["Fighter", "Assassin"], ["middle", "top"]);
const Malphite = makeChamp(2, "Malphite", ["Tank", "Fighter"], ["top"]);
const Lulu = makeChamp(3, "Lulu", ["Support"], ["support"]);
const Jinx = makeChamp(4, "Jinx", ["Marksman"], ["bottom"]);
const Graves = makeChamp(5, "Graves", ["Assassin", "Fighter"], ["jungle"]);
const Thresh = makeChamp(6, "Thresh", ["Support"], ["support"]);
const Ahri = makeChamp(7, "Ahri", ["Mage", "Assassin"], ["middle"]);
const Darius = makeChamp(8, "Darius", ["Fighter", "Tank"], ["top"]);

const ALL_CHAMPS = [Yasuo, Malphite, Lulu, Jinx, Graves, Thresh, Ahri, Darius];

// ─── buildChampionIndex ───────────────────────────────────────────────────────

describe("buildChampionIndex", () => {
  it("ordena los campeones por ID ascendente", () => {
    const index = buildChampionIndex([Thresh, Ahri, Yasuo, Malphite]);
    // IDs: 1, 2, 6, 7 → orden: Yasuo(1), Malphite(2), Thresh(6), Ahri(7)
    expect(index.slotToId[0]).toBe(1); // Yasuo
    expect(index.slotToId[1]).toBe(2); // Malphite
    expect(index.slotToId[2]).toBe(6); // Thresh
    expect(index.slotToId[3]).toBe(7); // Ahri
  });

  it("construye un mapa id→slot correcto", () => {
    const index = buildChampionIndex(ALL_CHAMPS);
    // IDs del 1 al 8 → slots 0 a 7
    expect(index.idToSlot.get(1)).toBe(0); // Yasuo (menor ID)
    expect(index.idToSlot.get(8)).toBe(7); // Darius (mayor ID)
    expect(index.poolSize).toBe(8);
  });

  it("asigna aliases correctamente", () => {
    const index = buildChampionIndex([Ahri, Yasuo]);
    expect(index.slotToAlias[0]).toBe("Yasuo"); // ID 1
    expect(index.slotToAlias[1]).toBe("Ahri");  // ID 7
  });

  it("es estable con el mismo array de entrada", () => {
    const idx1 = buildChampionIndex(ALL_CHAMPS);
    const idx2 = buildChampionIndex(ALL_CHAMPS);
    expect(idx1.slotToId).toEqual(idx2.slotToId);
  });
});

// ─── encodeDraftState ────────────────────────────────────────────────────────

describe("encodeDraftState", () => {
  let champIndex = buildChampionIndex(ALL_CHAMPS);

  beforeEach(() => {
    champIndex = buildChampionIndex(ALL_CHAMPS);
  });

  it("devuelve un Float32Array de longitud STATE_DIM", () => {
    const game = createGame(1, "Blue", "Red");
    const vec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(STATE_DIM);
  });

  it("tiene STATE_DIM = SCALAR_DIMS + CHAMPION_POOL_SIZE × CHAMP_DIMS", () => {
    expect(STATE_DIM).toBe(SCALAR_DIMS + CHAMPION_POOL_SIZE * CHAMP_DIMS);
    // 27 + 236 × 16 = 3803
    expect(STATE_DIM).toBe(3803);
  });

  it("codifica el índice de acción normalizado en la posición 0", () => {
    const game = createGame(1, "Blue", "Red");
    const vec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    // actionIndex=0 → 0/19 = 0
    expect(vec[0]).toBeCloseTo(0);

    // Simular actionIndex=19 (último turno) manualmente
    const gameAt19 = { ...game, actionIndex: 19 };
    const vec19 = encodeDraftState(gameAt19, ALL_CHAMPS, champIndex, "blue", new Set());
    expect(vec19[0]).toBeCloseTo(1.0);
  });

  it("codifica la fase correctamente (one-hot)", () => {
    const game = createGame(1, "Blue", "Red");
    // actionIndex=0 → Ban Phase 1 → vec[1]=1, vec[2..4]=0
    const vec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    expect(vec[1]).toBe(1); // ban phase 1
    expect(vec[2]).toBe(0);
    expect(vec[3]).toBe(0);
    expect(vec[4]).toBe(0);

    // actionIndex=6 → Pick Phase 1
    const gamePick = { ...game, actionIndex: 6 };
    const vecPick = encodeDraftState(gamePick, ALL_CHAMPS, champIndex, "blue", new Set());
    expect(vecPick[1]).toBe(0);
    expect(vecPick[2]).toBe(1); // pick phase 1
  });

  it("codifica el lado del AI (blue vs red)", () => {
    const game = createGame(1, "Blue", "Red");
    const vecBlue = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    expect(vecBlue[5]).toBe(1); // isBlue
    expect(vecBlue[6]).toBe(0); // isRed

    const vecRed = encodeDraftState(game, ALL_CHAMPS, champIndex, "red", new Set());
    expect(vecRed[5]).toBe(0);
    expect(vecRed[6]).toBe(1);
  });

  it("es determinista: misma entrada → mismo vector", () => {
    const game = createGame(1, "Blue", "Red");
    const vec1 = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    const vec2 = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    expect(Array.from(vec1)).toEqual(Array.from(vec2));
  });

  it("marca campeones usados como ilegales (feature 4 del bloque por campeón)", () => {
    // Crear un juego donde Yasuo (ID=1, slot=0) está baneado por blue
    const game = {
      ...createGame(1, "Blue", "Red"),
      blueBans: [1, null, null, null, null], // Yasuo baneado
    };
    const vec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());

    const yasuoSlot = champIndex.idToSlot.get(1)!; // slot 0
    const base = SCALAR_DIMS + yasuoSlot * CHAMP_DIMS;

    // blueBan = 1
    expect(vec[base + 0]).toBe(1);
    // legal = 0 (ya usado)
    expect(vec[base + 4]).toBe(0);

    // Malphite (slot 1) sigue libre
    const malphiteSlot = champIndex.idToSlot.get(2)!;
    const baseMal = SCALAR_DIMS + malphiteSlot * CHAMP_DIMS;
    expect(vec[baseMal + 4]).toBe(1);
  });

  it("marca campeones fearless-locked como ilegales", () => {
    const game = createGame(1, "Blue", "Red");
    const fearlessLocked = new Set<number>([4]); // Jinx bloqueada
    const vec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", fearlessLocked);

    const jinxSlot = champIndex.idToSlot.get(4)!;
    const base = SCALAR_DIMS + jinxSlot * CHAMP_DIMS;
    expect(vec[base + 4]).toBe(0); // illegal
  });

  it("todos los valores están en un rango razonable [-1, 100]", () => {
    const game = createGame(1, "Blue", "Red");
    const vec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());
    for (let i = 0; i < vec.length; i++) {
      expect(vec[i]).toBeGreaterThanOrEqual(-10);
      expect(vec[i]).toBeLessThanOrEqual(100);
    }
  });
});

// ─── buildLegalMask ───────────────────────────────────────────────────────────

describe("buildLegalMask", () => {
  it("devuelve Uint8Array de longitud CHAMPION_POOL_SIZE", () => {
    const champIndex = buildChampionIndex(ALL_CHAMPS);
    const game = createGame(1, "Blue", "Red");
    const mask = buildLegalMask(game, champIndex, new Set());
    expect(mask).toBeInstanceOf(Uint8Array);
    expect(mask.length).toBe(CHAMPION_POOL_SIZE);
  });

  it("todos los campeones del pool son legales en un juego vacío", () => {
    const champIndex = buildChampionIndex(ALL_CHAMPS);
    const game = createGame(1, "Blue", "Red");
    const mask = buildLegalMask(game, champIndex, new Set());
    for (let i = 0; i < ALL_CHAMPS.length; i++) {
      expect(mask[i]).toBe(1);
    }
    // Slots de padding (> poolSize) son 0
    for (let i = ALL_CHAMPS.length; i < CHAMPION_POOL_SIZE; i++) {
      expect(mask[i]).toBe(0);
    }
  });

  it("marca campeones baneados como ilegales", () => {
    const champIndex = buildChampionIndex(ALL_CHAMPS);
    const game = {
      ...createGame(1, "Blue", "Red"),
      blueBans: [1, null, null, null, null], // Yasuo
      redBans: [2, null, null, null, null],  // Malphite
    };
    const mask = buildLegalMask(game, champIndex, new Set());
    expect(mask[champIndex.idToSlot.get(1)!]).toBe(0); // Yasuo
    expect(mask[champIndex.idToSlot.get(2)!]).toBe(0); // Malphite
    expect(mask[champIndex.idToSlot.get(3)!]).toBe(1); // Lulu sigue libre
  });

  it("consistente con el feature legal del vector de estado", () => {
    const champIndex = buildChampionIndex(ALL_CHAMPS);
    const game = {
      ...createGame(1, "Blue", "Red"),
      bluePicks: [5, null, null, null, null], // Graves elegido
    };
    const mask = buildLegalMask(game, champIndex, new Set());
    const stateVec = encodeDraftState(game, ALL_CHAMPS, champIndex, "blue", new Set());

    // Para cada slot en el pool, el feature legal en el vector debe coincidir con la máscara
    for (let slot = 0; slot < ALL_CHAMPS.length; slot++) {
      const base = SCALAR_DIMS + slot * CHAMP_DIMS;
      const legalInVec = stateVec[base + 4];
      expect(legalInVec).toBe(mask[slot]);
    }
  });
});
