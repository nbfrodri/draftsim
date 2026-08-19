# Neural Draft Policy — Cuándo se usa neural vs heurística

Este documento es la fuente de verdad sobre el flujo de decisión de la IA del draft:
cuándo se usa la red neuronal, cuándo la heurística, y cómo se inicializa el modelo.

---

## Filosofía: "Neural en runtime, heurística como profesor"

La heurística es **fundamental**, no descartable:

- **Fallback garantizado** cuando el modelo no existe o está deshabilitado.
- **Profesor de Behavior Cloning (BC)**: el dataset de entrenamiento se genera
  *exclusivamente* con la heurística para evitar covariate shift.
- **Base de re-ranking híbrido** si se implementa en el futuro.
- **Debugging y comparación**: se puede forzar en cualquier momento.

La red neuronal es **el default en runtime**: una vez cargada, todos los paths
de juego (DraftApp, bulkSim worker, autoPlayMatch) la usan como primera opción.

---

## Tabla resumen: Neural vs Heurística

| Contexto | Path usado | Condición |
|---|---|---|
| **DraftApp (browser/desktop)** | `initNeuralDraftPolicyAsync` → neural | Modelo cargado OK |
| **DraftApp (browser/desktop)** | Heurística | Modelo no encontrado / fetch falló |
| **DraftApp antes de `ready`** | Heurística (race condition) | `initNeuralDraftPolicyAsync` no completó |
| **autoPlayMatch (via worker)** | `ensureNeuralReady` → neural | Worker inicializa antes del primer match |
| **autoPlayMatch (main thread)** | Neural si ya cargado, heurística si no | `initNeuralDraftPolicyAsync` debe haberse llamado antes |
| **bulkSim.worker.ts** | `initNeuralDraftPolicyAsync` → neural | Se llama antes del primer mensaje |
| **`generate-draft-dataset.ts`** | **Heurística siempre** (explícito) | `forceHeuristic: true` — es el "profesor" de BC |
| **`compare-neural-vs-heuristic.ts`** | Selectable por condición | Usa `injectNeuralPolicy` / `resetNeuralDraftPolicy` |
| **`NEURAL_DRAFT_DISABLED=1`** | Heurística siempre | Sobreescribe cualquier init |
| **`NEURAL_DRAFT_FORCE_HEURISTIC=1`** | Heurística siempre (sin desactivar init) | Debug / inspección comparativa |
| **Tests (Vitest)** | Heurística (a menos que `injectNeuralPolicy`) | Tests usan `injectNeuralPolicy` explícitamente |

---

## Flujo `chooseAIActionWithRationale`

```
chooseAIActionWithRationale(game, champions, fearlessLocked, seriesCtx, rng, personality, options?)
  │
  ├─ options.forceHeuristic || NEURAL_DRAFT_FORCE_HEURISTIC?
  │    └─ sí → saltar neural, ir directamente a heurística
  │
  ├─ llama chooseNeuralDraftActionWithRationale(...)
  │    │
  │    ├─ _policy === null? → return null (sin modelo cargado)
  │    └─ modelo cargado → inferencia neural → AIRationale con "Neural confidence"
  │
  └─ resultado === null? → caída a heurística (decidePick / decideBan)
```

**El caller no necesita detectar si el modelo está cargado.** Si no hay modelo, la función
retorna el resultado heurístico transparentemente.

### API de `forceHeuristic`

```typescript
import { chooseAIActionWithRationale, type AIActionOptions } from "@/lib/draftAI";

// Heurística explícita (dataset generation, tests, debugging)
const rationale = chooseAIActionWithRationale(
  game, champions, fearlessLocked, seriesCtx, rng,
  undefined,
  { forceHeuristic: true },
);
```

---

## `initNeuralDraftPolicyAsync` — cuándo es obligatorio

### Browser / Desktop (DraftApp)
```tsx
// components/DraftApp.tsx — se llama en useEffect al montar
useEffect(() => {
  if (!champions.length) return;
  initNeuralDraftPolicyAsync(champions);
}, [champions]);
```
Si el efecto no se ejecutó antes del primer turno de AI, el primer turno usa heurística y los
siguientes usan neural. Este es el "race antes de ready" — aceptable en práctica porque el
primer turno es muy rápido.

### Web Worker (bulkSim)
```typescript
// lib/sim/bulkSim.worker.ts — se llama antes del primer match
async function ensureNeuralReady(champions) {
  if (!_neuralReady) {
    _neuralReady = initNeuralDraftPolicyAsync(champions).then(() => void 0);
  }
  return _neuralReady;
}
self.onmessage = async (event) => {
  await ensureNeuralReady(msg.champions);
  autoPlayMatch(…);
};
```
El worker carga el modelo una sola vez (`/models/draft-policy.json` via fetch) y lo reutiliza
para todos los mensajes siguientes.

### Scripts Node.js
Los scripts de generación de dataset (`generate-draft-dataset.ts`) usan la IA heurística
**intencionalmente**: el dataset de BC clona la heurística como "profesor". No deben inicializar
el modelo neural para evitar bias de autoimitación.

El script de benchmark (`compare-neural-vs-heuristic.ts`) gestiona la política manualmente
mediante `injectNeuralPolicy` / `resetNeuralDraftPolicy`.

---

## Variables de entorno

| Variable | Valor | Efecto |
|---|---|---|
| `NEURAL_DRAFT_DISABLED` | `1` o `true` | Desactiva la red neural; todo va a heurística. Impide el init del modelo. |
| `NEURAL_DRAFT_FORCE_HEURISTIC` | `1` o `true` | Fuerza heurística en runtime sin impedir el init del modelo. Útil para debugging comparativo. |
| `NEURAL_DRAFT_MODEL_PATH` | ruta absoluta o URL | Sobreescribe la ruta del modelo |
| `DATASET_GAMES` | entero | Número de partidas para `generate-draft-dataset.ts` |
| `DATASET_OUTPUT` | ruta | Archivo JSONL de salida del dataset |
| `DATASET_APPEND` | `true` | Añade al archivo existente en vez de sobreescribir |
| `COMPARE_GAMES` | entero | Partidas por condición en el benchmark (default: 400) |

---

## Orden de resolución del modelo

1. `NEURAL_DRAFT_MODEL_PATH` (env)
2. Browser/Worker: `/models/draft-policy.json` (fetch desde public/)
3. Node.js: `public/models/draft-policy.json` relativo al proyecto

---

## Fallo silencioso — modelo no encontrado

Si la fetch/fs.readFile falla o el archivo no existe, `loadNeuralPolicyAsync` devuelve `null`.
`applyLoadedPolicy` registra el fallback en consola:

```
[neuralDraft] Modelo no encontrado en /models/draft-policy.json. Usando IA heurística como fallback.
```

No se lanza ninguna excepción; el draft continúa con heurística.

---

## Dimensiones del modelo (dimensions.json)

```json
{
  "CHAMPION_POOL_SIZE": 236,
  "SCALAR_DIMS": 27,
  "CHAMP_DIMS": 16,
  "STATE_DIM": 3803,
  "LEGAL_OFFSET": 4
}
```

`STATE_DIM = SCALAR_DIMS + CHAMPION_POOL_SIZE × CHAMP_DIMS = 27 + 236 × 16 = 3803`

Este archivo es la única fuente de verdad de dimensiones para TypeScript y Python:
- `lib/draftAI/neural/stateEncoder.ts` lo importa directamente
- `training/dataset.py` lo lee al importar

**Si cambias las dimensiones, debes reentrenar el modelo desde cero.**

---

## Deploy final

1. Generar dataset: `DATASET_GAMES=500000 npm exec tsx -- scripts/generate-draft-dataset.ts`
2. Entrenar BC: `cd training && python train_bc.py --epochs 100 --batch 512`
3. (Opcional) Fine-tune RL: `cd training && python train_rl.py`
4. Exportar: `python export.py --checkpoint checkpoints/best.pt --output ../public/models/draft-policy.json`
5. Build desktop: `npm run tauri build` (o `npm run build` para web)
6. Verificar en app: busca `AI: Neural` en el HUD del draft

---

## Arquitectura del modelo (BC)

```
Input: 3803 floats
  ├─ 27 escalares: actionIndex, fase, lado, dificultad, serie, tiers de roster
  └─ 236 × 16 dims por campeón ordenados por ID:
       blueBan, redBan, bluePick, redPick, legal,
       metaTier×5 lanes, myPool, oppPool, myBadPool,
       synergyScore, counterScore, tournamentWR

Trunk: Linear(3803,512)→LayerNorm→ReLU→Dropout(0.1)
       Linear(512,256) →LayerNorm→ReLU→Dropout(0.1)
       Linear(256,128) →LayerNorm→ReLU→Dropout(0.1)

Policy head: Linear(128, 236) → masked softmax → champion slot
Value head:  Linear(128, 1)   → sigmoid → win probability
```
