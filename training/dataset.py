"""Dataset de turnos del draft para entrenamiento behavior-cloning.

Cada línea del JSONL es un DraftTurnRecord con:
  state       : list[float]  — vector de estado (STATE_DIM floats)
  actionSlot  : int          — índice del campeón elegido en el pool (target)
  kind        : "pick"|"ban"
  side        : "blue"|"red"
  outcome     : "win"|"loss"|"draw"|"unknown"
  meta        : {difficulty, personalityId?, gameIndex, fearless, actionIndex}

El dataset separa picks y bans opcionalmente, aplica la máscara legal
(slot legal si state[SCALAR_DIMS + slot*CHAMP_DIMS + 4] == 1), y normaliza.

Augmentación (opcional):
  Cuando augment=True, aplica perturbaciones suaves en los features de meta
  tier (índices 5-9 por campeón) y en los features de forma / win rate
  (índices 13-15 por campeón). Esto añade diversidad artificial al dataset
  y mejora la robustez del modelo a variaciones en el meta.
"""

import json
import math
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader, random_split

# Dimensiones del vector — single source: training/dimensions.json
_DIMS_PATH = Path(__file__).parent / "dimensions.json"
with open(_DIMS_PATH, encoding="utf-8") as _dims_file:
    _DIMS = json.load(_dims_file)

CHAMPION_POOL_SIZE = _DIMS["CHAMPION_POOL_SIZE"]
CHAMP_DIMS = _DIMS["CHAMP_DIMS"]
SCALAR_DIMS = _DIMS["SCALAR_DIMS"]
STATE_DIM = _DIMS["STATE_DIM"]
LEGAL_OFFSET = _DIMS["LEGAL_OFFSET"]

# Offsets de features por campeón dentro de su bloque CHAMP_DIMS
# Deben coincidir con stateEncoder.ts
_TIER_OFFSET = 5      # meta tier lanes [top, jg, mid, bot, sup] (5 floats)
_SYNERGY_OFFSET = 13  # synergyScore
_COUNTER_OFFSET = 14  # counterScore
_TWR_OFFSET = 15      # tournamentWR


def build_legal_mask(state: np.ndarray) -> np.ndarray:
    """Extrae la máscara de acciones legales del vector de estado.

    Devuelve un array booleano de longitud CHAMPION_POOL_SIZE donde True indica
    que el campeón es una acción legal en este turno.
    """
    mask = np.zeros(CHAMPION_POOL_SIZE, dtype=bool)
    for slot in range(CHAMPION_POOL_SIZE):
        base = SCALAR_DIMS + slot * CHAMP_DIMS
        mask[slot] = state[base + LEGAL_OFFSET] > 0.5
    return mask


def augment_state(
    state: np.ndarray,
    rng: np.random.Generator,
    tier_noise_std: float = 0.05,
    meta_noise_std: float = 0.03,
) -> np.ndarray:
    """Aplica perturbaciones suaves al vector de estado para augmentación.

    Perturba:
      - Meta tiers por campeón (features 5-9 por slot): noise gaussiano suave
        clipeado a [0,1]. Simula variaciones del meta.
      - Sinergia/counter/tournamentWR (features 13-15): noise gaussiano muy suave.
        Simula variabilidad en la información de scouting.

    No toca features binarios (board state: 0-3, legal: 4, pool: 10-12)
    ni el bloque escalar global (primeros SCALAR_DIMS valores).

    Args:
        state: Array de estado original (no se modifica in-place).
        rng: Generador aleatorio NumPy.
        tier_noise_std: Desviación estándar del ruido en tiers de meta.
        meta_noise_std: Desviación estándar del ruido en sinergia/counter/WR.

    Returns:
        Nuevo array con perturbaciones aplicadas.
    """
    state = state.copy()

    for slot in range(CHAMPION_POOL_SIZE):
        base = SCALAR_DIMS + slot * CHAMP_DIMS

        # Skip slots de padding (todos ceros — no hay campeón real)
        if state[base + LEGAL_OFFSET] == 0 and state[base] == 0:
            # Heurístico: si legal=0 y blueBan=0, puede ser padding
            # Comprobar que todo el slot es cero
            if np.all(state[base:base + CHAMP_DIMS] == 0):
                continue

        # Perturbar meta tiers [5..9]
        for fi in range(5):
            idx = base + _TIER_OFFSET + fi
            state[idx] = float(np.clip(
                state[idx] + rng.normal(0, tier_noise_std), 0.0, 1.0
            ))

        # Perturbar sinergia, counter, tournamentWR [13..15]
        for fi in range(3):
            idx = base + _SYNERGY_OFFSET + fi
            state[idx] = float(np.clip(
                state[idx] + rng.normal(0, meta_noise_std), -2.0, 2.0
            ))

    return state


class DraftDataset(Dataset):
    """Dataset PyTorch de turnos del draft.

    Args:
        jsonl_path: Ruta al archivo JSONL generado por generate-draft-dataset.ts.
        kind_filter: Si se especifica ("pick" o "ban"), filtra por tipo de acción.
        outcome_filter: Si se especifica, filtra por outcome ("win", "loss", etc.).
        min_legal_actions: Descarta turnos con menos acciones legales que este umbral.
        augment: Si True, aplica augmentación aleatoria en __getitem__.
        augment_prob: Probabilidad de aplicar augmentación a cada muestra.
        augment_tier_noise: Std del ruido en features de meta tier.
        augment_meta_noise: Std del ruido en features de sinergia/counter/WR.
        seed: Semilla para la augmentación reproducible.
    """

    def __init__(
        self,
        jsonl_path: str | Path,
        kind_filter: Optional[str] = None,
        outcome_filter: Optional[str] = None,
        min_legal_actions: int = 1,
        augment: bool = False,
        augment_prob: float = 0.5,
        augment_tier_noise: float = 0.05,
        augment_meta_noise: float = 0.03,
        seed: int = 42,
    ):
        self.augment = augment
        self.augment_prob = augment_prob
        self.augment_tier_noise = augment_tier_noise
        self.augment_meta_noise = augment_meta_noise
        self._rng = np.random.default_rng(seed)

        self.records: list[dict] = []
        self.states: list[np.ndarray] = []
        self.targets: list[int] = []
        self.legal_masks: list[np.ndarray] = []

        path = Path(jsonl_path)
        if not path.exists():
            raise FileNotFoundError(f"Dataset no encontrado: {path}")

        discarded = 0
        loaded = 0

        with open(path, encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"[dataset] Línea {line_num} inválida, omitida: {e}")
                    discarded += 1
                    continue

                if kind_filter and rec.get("kind") != kind_filter:
                    continue
                if outcome_filter and rec.get("outcome") != outcome_filter:
                    continue

                state_list = rec.get("state", [])
                if len(state_list) != STATE_DIM:
                    discarded += 1
                    continue

                state = np.array(state_list, dtype=np.float32)
                action_slot = int(rec["actionSlot"])

                if not (0 <= action_slot < CHAMPION_POOL_SIZE):
                    discarded += 1
                    continue

                legal_mask = build_legal_mask(state)
                if legal_mask.sum() < min_legal_actions:
                    discarded += 1
                    continue

                if not legal_mask[action_slot]:
                    discarded += 1
                    continue

                self.states.append(state)
                self.targets.append(action_slot)
                self.legal_masks.append(legal_mask)
                self.records.append(rec)
                loaded += 1

        print(
            f"[dataset] Cargados {loaded} turnos, descartados {discarded} "
            f"({100 * discarded / max(1, loaded + discarded):.1f}%) de {path.name}"
        )
        if augment:
            print(f"[dataset] Augmentación activa (prob={augment_prob}, "
                  f"tier_noise={augment_tier_noise}, meta_noise={augment_meta_noise})")

    def __len__(self) -> int:
        return len(self.states)

    def __getitem__(self, idx: int):
        state = self.states[idx]

        if self.augment and self._rng.random() < self.augment_prob:
            state = augment_state(
                state,
                self._rng,
                tier_noise_std=self.augment_tier_noise,
                meta_noise_std=self.augment_meta_noise,
            )

        return (
            torch.from_numpy(state),
            torch.tensor(self.targets[idx], dtype=torch.long),
            torch.from_numpy(self.legal_masks[idx]),
        )

    def state_dim(self) -> int:
        return STATE_DIM

    def num_actions(self) -> int:
        return CHAMPION_POOL_SIZE


def make_dataloaders(
    dataset: DraftDataset,
    val_frac: float = 0.1,
    batch_size: int = 256,
    num_workers: int = 0,
    seed: int = 42,
) -> tuple[DataLoader, DataLoader]:
    """Divide el dataset en train/val y devuelve los DataLoaders."""
    n_val = max(1, int(len(dataset) * val_frac))
    n_train = len(dataset) - n_val
    gen = torch.Generator().manual_seed(seed)
    train_ds, val_ds = random_split(dataset, [n_train, n_val], generator=gen)

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size * 2,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=torch.cuda.is_available(),
    )
    return train_loader, val_loader
