// Logger de turnos del draft para el pipeline de self-play.
//
// Cada turno registra el vector de estado, la acción tomada (índice en el
// pool de campeones) y el ID real del campeón. El resultado del partido se
// rellena DESPUÉS de que se resuelve la simulación, usando `setOutcome`.
//
// Uso típico:
//   const logger = createDraftLogger();
//   // ... por cada turno del draft:
//   logger.record(stateVec, champSlot, champId, "pick", "blue", metadata);
//   // ... al finalizar el partido:
//   logger.setOutcome("win");
//   // ... al generar el dataset:
//   const jsonl = logger.toJSONL();

export type MatchOutcome = "win" | "loss" | "draw";

export interface TurnMetadata {
  difficulty: string;
  personalityId?: string;
  gameIndex: number;
  fearless: boolean;
  actionIndex: number;
}

/** Un registro de turno del draft, listo para serializar a JSONL. */
export interface DraftTurnRecord {
  /** Vector de estado codificado como array numérico (para JSON). */
  state: number[];
  /** Índice del campeón elegido en el pool ordenado (target de clasificación). */
  actionSlot: number;
  /** ID real del campeón elegido (para debug/trazabilidad). */
  actionChampionId: number;
  /** Tipo de acción: pick o ban. */
  kind: "pick" | "ban";
  /** Lado que actúa. */
  side: "blue" | "red";
  /** Resultado del partido para este turno. Se rellena post-simulación. */
  outcome: MatchOutcome | "unknown";
  /** Metadatos adicionales del turno. */
  meta: TurnMetadata;
}

export interface DraftLogger {
  /** Registra un turno del draft. */
  record(
    stateVec: Float32Array,
    actionSlot: number,
    actionChampionId: number,
    kind: "pick" | "ban",
    side: "blue" | "red",
    meta: TurnMetadata,
  ): void;
  /** Asigna el resultado del partido a todos los turnos registrados hasta ahora. */
  setOutcome(outcome: MatchOutcome): void;
  /** Devuelve los registros actuales. */
  getRecords(): readonly DraftTurnRecord[];
  /** Serializa a JSONL (una línea JSON por registro). */
  toJSONL(): string;
}

export function createDraftLogger(): DraftLogger {
  const records: DraftTurnRecord[] = [];

  return {
    record(stateVec, actionSlot, actionChampionId, kind, side, meta) {
      records.push({
        state: Array.from(stateVec),
        actionSlot,
        actionChampionId,
        kind,
        side,
        outcome: "unknown",
        meta,
      });
    },

    setOutcome(outcome) {
      for (const r of records) r.outcome = outcome;
    },

    getRecords() {
      return records;
    },

    toJSONL() {
      return records.map((r) => JSON.stringify(r)).join("\n");
    },
  };
}

/**
 * Fusiona múltiples loggers en un único string JSONL.
 * Útil para acumular partidas en paralelo y luego volcar todo al disco.
 */
export function mergeToJSONL(loggers: readonly DraftLogger[]): string {
  const lines: string[] = [];
  for (const logger of loggers) {
    const jsonl = logger.toJSONL();
    if (jsonl) lines.push(jsonl);
  }
  return lines.join("\n");
}
