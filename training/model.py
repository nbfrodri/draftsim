"""Modelo de red neuronal para la política de draft.

Arquitectura: MLP con cabeza de política (clasificación de campeón) y cabeza de
valor opcional (predicción de win rate). Diseñado para ser:
  - Ligero: inferencia rápida en CPU para el servidor TypeScript.
  - Exportable: pesos JSON consumibles por la inferencia pura TypeScript.
  - Enmascarable: la cabeza de política aplica una máscara de acciones legales
    antes del softmax para garantizar que el modelo nunca elige un campeón
    no disponible.

Formato de exportación (weights.json):
  {
    "version": 1,
    "state_dim": 3227,
    "num_actions": 200,
    "hidden_dims": [512, 256, 128],
    "layers": [
      {"W": [[...], ...], "b": [...]},  // dense 0: state_dim → hidden[0]
      {"W": [[...], ...], "b": [...]},  // dense 1: hidden[0] → hidden[1]
      {"W": [[...], ...], "b": [...]},  // dense 2: hidden[1] → hidden[2]
    ],
    "policy_head": {"W": [[...], ...], "b": [...]},  // hidden[-1] → num_actions
    "value_head":  {"W": [[...], ...], "b": [...]}   // hidden[-1] → 1  (opcional)
  }
"""

import json
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F

# Dimensiones por defecto (deben coincidir con dataset.py y stateEncoder.ts)
DEFAULT_STATE_DIM = 3227
DEFAULT_NUM_ACTIONS = 200
DEFAULT_HIDDEN_DIMS = [512, 256, 128]


class DraftPolicyNet(nn.Module):
    """MLP con política enmascarada y cabeza de valor opcional.

    Args:
        state_dim: Dimensión del vector de entrada.
        num_actions: Número de acciones (CHAMPION_POOL_SIZE).
        hidden_dims: Tamaños de las capas ocultas.
        dropout: Tasa de dropout entre capas ocultas.
        use_value_head: Si True, añade una cabeza de valor escalar.
    """

    def __init__(
        self,
        state_dim: int = DEFAULT_STATE_DIM,
        num_actions: int = DEFAULT_NUM_ACTIONS,
        hidden_dims: list[int] | None = None,
        dropout: float = 0.1,
        use_value_head: bool = True,
    ):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = DEFAULT_HIDDEN_DIMS

        self.state_dim = state_dim
        self.num_actions = num_actions
        self.hidden_dims = hidden_dims
        self.use_value_head = use_value_head

        # Troncal compartida (encoder)
        layers: list[nn.Module] = []
        in_dim = state_dim
        for h_dim in hidden_dims:
            layers.append(nn.Linear(in_dim, h_dim))
            layers.append(nn.LayerNorm(h_dim))
            layers.append(nn.ReLU())
            if dropout > 0:
                layers.append(nn.Dropout(dropout))
            in_dim = h_dim
        self.trunk = nn.Sequential(*layers)

        # Cabeza de política: logits de acciones
        self.policy_head = nn.Linear(in_dim, num_actions)

        # Cabeza de valor: predicción de win rate escalar
        if use_value_head:
            self.value_head = nn.Linear(in_dim, 1)

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.orthogonal_(m.weight, gain=1.0)
                nn.init.zeros_(m.bias)

    def forward(
        self,
        state: torch.Tensor,
        legal_mask: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        """Pasa adelante por el modelo.

        Args:
            state: [batch, state_dim] float32
            legal_mask: [batch, num_actions] bool/float — True donde la acción
                es legal. Si se provee, las acciones ilegales se enmascaran con
                -1e9 antes del softmax.

        Returns:
            dict con:
              "logits"  : [batch, num_actions] — logits crudos (sin enmascarar)
              "policy"  : [batch, num_actions] — log-softmax enmascarado
              "value"   : [batch, 1]           — solo si use_value_head=True
        """
        features = self.trunk(state)

        logits = self.policy_head(features)

        if legal_mask is not None:
            # Enmascarar acciones ilegales con -1e9 para que tengan prob ≈ 0
            logits = logits.masked_fill(~legal_mask.bool(), -1e9)

        log_policy = F.log_softmax(logits, dim=-1)

        out = {"logits": logits, "policy": log_policy}

        if self.use_value_head:
            value = torch.sigmoid(self.value_head(features))
            out["value"] = value

        return out

    def predict_action(
        self,
        state: torch.Tensor,
        legal_mask: torch.Tensor | None = None,
        temperature: float = 1.0,
    ) -> int:
        """Devuelve el índice de acción con mayor probabilidad (greedy).

        Solo para inferencia individual (batch=1).
        """
        self.eval()
        with torch.no_grad():
            out = self.forward(state.unsqueeze(0), legal_mask=legal_mask.unsqueeze(0) if legal_mask is not None else None)
            logits = out["logits"][0]
            if temperature != 1.0 and temperature > 0:
                logits = logits / temperature
            return int(logits.argmax().item())

    def export_weights(self) -> dict:
        """Serializa los pesos del modelo a un dict JSON-compatible.

        El formato es consumido directamente por la inferencia TypeScript en
        lib/draftAI/neural/policy.ts.
        """
        layers_data = []
        # Extraer capas Linear del trunk en orden
        for module in self.trunk:
            if isinstance(module, nn.Linear):
                layers_data.append(
                    {
                        "W": module.weight.detach().cpu().tolist(),
                        "b": module.bias.detach().cpu().tolist(),
                    }
                )

        payload: dict = {
            "version": 1,
            "state_dim": self.state_dim,
            "num_actions": self.num_actions,
            "hidden_dims": self.hidden_dims,
            "layers": layers_data,
            "policy_head": {
                "W": self.policy_head.weight.detach().cpu().tolist(),
                "b": self.policy_head.bias.detach().cpu().tolist(),
            },
        }

        if self.use_value_head:
            payload["value_head"] = {
                "W": self.value_head.weight.detach().cpu().tolist(),
                "b": self.value_head.bias.detach().cpu().tolist(),
            }

        return payload

    def save_weights_json(self, path: str | Path) -> None:
        """Guarda los pesos en formato JSON para la inferencia TypeScript."""
        payload = self.export_weights()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
        size_mb = Path(path).stat().st_size / 1e6
        print(f"[model] Pesos exportados a {path} ({size_mb:.1f} MB)")

    @classmethod
    def from_weights_json(cls, path: str | Path) -> "DraftPolicyNet":
        """Carga el modelo desde un JSON de pesos exportado."""
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        model = cls(
            state_dim=data["state_dim"],
            num_actions=data["num_actions"],
            hidden_dims=data["hidden_dims"],
            use_value_head="value_head" in data,
        )

        # Rellenar pesos del trunk
        linear_idx = 0
        for module in model.trunk:
            if isinstance(module, nn.Linear):
                w = torch.tensor(data["layers"][linear_idx]["W"])
                b = torch.tensor(data["layers"][linear_idx]["b"])
                module.weight.data.copy_(w)
                module.bias.data.copy_(b)
                linear_idx += 1

        ph = data["policy_head"]
        model.policy_head.weight.data.copy_(torch.tensor(ph["W"]))
        model.policy_head.bias.data.copy_(torch.tensor(ph["b"]))

        if "value_head" in data and model.use_value_head:
            vh = data["value_head"]
            model.value_head.weight.data.copy_(torch.tensor(vh["W"]))
            model.value_head.bias.data.copy_(torch.tensor(vh["b"]))

        return model
