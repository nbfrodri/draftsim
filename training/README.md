# Pipeline de Entrenamiento Neural — DraftSim

Pipeline completo para entrenar la red neuronal de política de draft e integrarla
en la aplicación TypeScript.

## Requisitos

- Python ≥ 3.11
- PyTorch ≥ 2.2 (CPU suficiente para el modelo ligero; GPU acelera el entrenamiento)
- Node.js con `tsx` instalado (ya incluido en devDependencies del proyecto)

```bash
cd training
pip install -r requirements.txt
```

---

## Flujo completo

### 1. Generar el dataset

Desde la raíz del proyecto:

```bash
# Dataset pequeño para prueba rápida (100 partidas ≈ 2000 turnos)
DATASET_GAMES=100 npx tsx scripts/generate-draft-dataset.ts

# Dataset de entrenamiento real (recomendado: 5000+ partidas)
DATASET_GAMES=5000 DATASET_OUTPUT=data/draft-dataset.jsonl npx tsx scripts/generate-draft-dataset.ts

# Variables de entorno disponibles:
#   DATASET_GAMES=1000        Número de partidas (default: 1000)
#   DATASET_OUTPUT=...        Ruta del archivo JSONL (default: data/draft-dataset.jsonl)
#   DATASET_APPEND=true       Añadir al archivo existente en vez de sobreescribir
#   DATASET_SEED=42           Semilla para reproducibilidad
```

El script:
- Descarga el roster de campeones desde CommunityDragon + Meraki.
- Simula partidas completas (los 20 turnos del draft) usando la IA heurística.
- Registra el estado del draft en cada turno junto con la acción elegida.
- Simula el resultado del partido y anota el outcome por turno.
- Escribe un archivo JSONL (una línea = un turno del draft).

Tamaño estimado: ~2 KB por línea → 1000 partidas ≈ 40 MB.

---

### 2. Entrenar el modelo

```bash
cd training

# Entrenamiento básico (50 épocas, CPU)
python train_bc.py \
  --data ../data/draft-dataset.jsonl \
  --output ../public/models/draft-policy.json

# Opciones adicionales:
python train_bc.py \
  --data ../data/draft-dataset.jsonl \
  --output ../public/models/draft-policy.json \
  --epochs 100 \
  --batch 512 \
  --lr 5e-4 \
  --hidden 512 256 128 \
  --kind all            # "all" | "pick" | "ban"

# Reanudar desde checkpoint:
python train_bc.py \
  --data ../data/draft-dataset.jsonl \
  --output ../public/models/draft-policy.json \
  --resume checkpoints/best.pt
```

El entrenamiento guarda checkpoints en `training/checkpoints/` y exporta
automáticamente el mejor modelo al finalizar.

**Métricas esperadas** (1000 partidas, 50 épocas, hidden=[512,256,128]):
- Top-1 accuracy: ~30-40% (la IA heurística tiene alta varianza interna)
- Top-5 accuracy: ~60-75%
- Val loss: ~3.0-4.0

Con 5000+ partidas y 100 épocas se esperan mejores métricas.

---

### 3. Exportar un checkpoint específico

```bash
cd training
python export.py \
  --checkpoint checkpoints/epoch_0100.pt \
  --output ../public/models/draft-policy.json
```

---

### 4. Desplegar en la aplicación

El archivo de pesos JSON debe colocarse en una ruta accesible desde el proceso
Node.js del servidor. Las opciones son:

**A. Archivo en `public/models/` (Next.js)**
```
public/
  models/
    draft-policy.json   ← colocar aquí
```

**B. Ruta personalizada via variable de entorno**
```bash
# .env.local
NEURAL_DRAFT_MODEL_PATH=./public/models/draft-policy.json
```

La inferencia TypeScript (`lib/draftAI/neural/policy.ts`) lee la ruta desde:
1. `process.env.NEURAL_DRAFT_MODEL_PATH`
2. Por defecto: `public/models/draft-policy.json`

Si el archivo no existe, la IA cae de vuelta a la heurística clásica sin error.

---

## Arquitectura del modelo

```
Input: state_dim = 3227 floats
  ├─ 27 scalars: actionIndex, fase, lado, dificultad, contexto de serie, roster tiers
  └─ 200 × 16 dims: por cada campeón en el pool ordenado por ID
       blueBan, redBan, bluePick, redPick, legal,
       metaTier×5 lanes, myPool, oppPool, myBadPool,
       synergyScore, counterScore, tournamentWR

Trunk: Linear(3227,512) → LayerNorm → ReLU → Dropout
       Linear(512,256)  → LayerNorm → ReLU → Dropout
       Linear(256,128)  → LayerNorm → ReLU → Dropout

Policy head: Linear(128, 200) → masked softmax → champion slot
Value head:  Linear(128, 1)   → sigmoid → win probability
```

## Inferencia TypeScript (sin dependencias externas)

El forward pass del modelo se ejecuta en TypeScript puro con los pesos cargados
desde el JSON. No se requiere ONNX ni bindings nativos para el servidor.

Archivo: `lib/draftAI/neural/policy.ts`

---

## Formato del dataset (JSONL)

Cada línea es un JSON con la estructura `DraftTurnRecord`:

```jsonc
{
  "state": [0.42, 0.0, ...],   // Float32Array como número[] (STATE_DIM = 3227)
  "actionSlot": 47,            // Índice en el pool ordenado por ID (target)
  "actionChampionId": 238,     // ID real del campeón (para debug)
  "kind": "pick",              // "pick" | "ban"
  "side": "blue",              // "blue" | "red"
  "outcome": "win",            // "win" | "loss" | "draw"
  "meta": {
    "difficulty": "normal",
    "personalityId": "aggressive",
    "gameIndex": 2,
    "fearless": false,
    "actionIndex": 7
  }
}
```
