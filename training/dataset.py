"""Dataset de turnos del draft para entrenamiento behavior-cloning.

Cada línea del JSONL es un DraftTurnRecord con:
  state       : list[float]  — vector de estado (STATE_DIM = 3227 floats)
  actionSlot  : int          — índice del campeón elegido en el pool (target)
  kind        : "pick"|"ban"
  side        : "blue"|"red"
  outcome     : "win"|"loss"|"draw"|"unknown"
  meta        : {difficulty, personalityId?, gameIndex, fearless, actionIndex}

El dataset separa picks y bans opcionalmente, aplica la máscara legal
(slot legal si state[SCALAR_DIMS + slot*CHAMP_DIMS + 4] == 1), y normaliza.
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


class DraftDataset(Dataset):
    """Dataset PyTorch de turnos del draft.

    Args:
        jsonl_path: Ruta al archivo JSONL generado por generate-draft-dataset.ts.
        kind_filter: Si se especifica ("pick" o "ban"), filtra por tipo de acción.
        outcome_filter: Si se especifica, filtra por outcome ("win", "loss", etc.).
        min_legal_actions: Descarta turnos con menos acciones legales que este umbral.
    """

    def __init__(
        self,
        jsonl_path: str | Path,
        kind_filter: Optional[str] = None,
        outcome_filter: Optional[str] = None,
        min_legal_actions: int = 1,
    ):
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

                # Filtros opcionales
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

                # Comprobar que la acción elegida era realmente legal
                if not legal_mask[action_slot]:
                    # Puede ocurrir raramente si el encoder y el AI están desincronizados
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

    def __len__(self) -> int:
        return len(self.states)

    def __getitem__(self, idx: int):
        return (
            torch.from_numpy(self.states[idx]),
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
