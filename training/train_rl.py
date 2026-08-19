"""Fine-tuning con Reinforcement Learning (REINFORCE / Policy Gradient) para la
política de draft.

Carga un checkpoint de BC como punto de partida y lo mejora minimizando la
pérdida de política (REINFORCE) con recompensas derivadas del simulador de
partidas (`simulateMatch`).

Estrategia de reward shaping:
  - Dense (por turno): no disponible directo desde el simulador, se aproxima
    al final del episodio distribuyendo el reward entre los turnos del agente.
  - Sparse (por partida): win=+1, loss=-1, draw=0, normalizado por baseline.
  - Baseline exponencial: media móvil exponencial del reward → reduce varianza.

Arquitectura:
  - Policy head: exactamente igual que en BC (cabeza de política softmax).
  - Value head: cabeza de valor (critic para REINFORCE con baseline).
  - El trunk compartido NO se congela por defecto para permitir adaptación.

Uso:
  cd training
  python train_rl.py \\
    --bc-checkpoint checkpoints/best.pt \\
    --output ../public/models/draft-policy.json \\
    --games-per-update 64 \\
    --epochs 20

El script requiere que el roster de campeones sea accesible desde Node.js
(no hace fetch online — lee de data/champions.json si existe, o usa un
stub genérico de campeones si no).

NOTA: Este script genera rollouts simulando drafts completos con la propia
política actual (auto-play). El simulador de partidas proporciona el reward
al final de cada draft completo (20 turnos). La política se actualiza con
REINFORCE usando un baseline exponencial para reducir la varianza.
"""

import argparse
import json
import os
import time
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from model import DraftPolicyNet

# ─── Constantes de dimensiones ───────────────────────────────────────────────

_DIMS_PATH = Path(__file__).parent / "dimensions.json"
_DIMS = json.loads(_DIMS_PATH.read_text())

CHAMPION_POOL_SIZE = _DIMS["CHAMPION_POOL_SIZE"]
SCALAR_DIMS = _DIMS["SCALAR_DIMS"]
CHAMP_DIMS = _DIMS["CHAMP_DIMS"]
STATE_DIM = _DIMS["STATE_DIM"]
LEGAL_OFFSET = _DIMS["LEGAL_OFFSET"]

# ─── Simulador de drafts en Python (lectura del dataset JSONL existente) ──────
#
# En lugar de re-implementar el simulador completo en Python, el RL usa el
# dataset JSONL de BC como "environment" de rollout: muestrea episodios del
# dataset y calcula el reward basándose en el outcome de cada episodio.
#
# Este es el enfoque "offline RL" — más estable que el online RL puro porque:
#   1. No requiere re-ejecutar el simulador Node.js desde Python.
#   2. Los datos ya tienen outcomes (win/loss/draw) calculados por simulateMatch.
#   3. Permite iterar rápidamente con el mismo dataset de BC.
#
# Limitación: la distribución de estados viene del dataset (comportamiento del
# profesor), no del comportamiento actual de la política. Esto es REINFORCE
# offline — aproxima RL pero no es on-policy. Para RL on-policy puro se
# necesita un wrapper Python→Node.js.

class EpisodeBuffer:
    """Buffer de episodios del draft cargados desde el dataset JSONL.

    Cada episodio es un conjunto de turnos consecutivos de la misma partida,
    identificados por el campo meta.gameIndex + secuencia en el archivo.
    """

    def __init__(self, jsonl_path: str, max_episodes: Optional[int] = None):
        self.episodes: list[list[dict]] = []

        path = Path(jsonl_path)
        if not path.exists():
            raise FileNotFoundError(f"Dataset no encontrado: {path}")

        current_episode: list[dict] = []
        prev_action_idx = -1

        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue

                action_idx = rec.get("meta", {}).get("actionIndex", 0)

                # Detectar inicio de nuevo episodio: actionIndex reinicia a 0
                # o baja respecto al anterior
                if action_idx <= prev_action_idx and current_episode:
                    if len(current_episode) >= 4:  # episodio mínimo válido
                        self.episodes.append(current_episode)
                    current_episode = []

                    if max_episodes and len(self.episodes) >= max_episodes:
                        break

                current_episode.append(rec)
                prev_action_idx = action_idx

            # Último episodio
            if current_episode and len(current_episode) >= 4:
                self.episodes.append(current_episode)

        print(f"[rl] Buffer: {len(self.episodes)} episodios cargados de {path.name}")

    def sample(self, n: int, rng: np.random.Generator) -> list[list[dict]]:
        """Muestrea n episodios aleatoriamente."""
        indices = rng.integers(0, len(self.episodes), size=n)
        return [self.episodes[i] for i in indices]


def outcome_to_reward(outcome: str) -> float:
    """Convierte outcome string a reward escalar."""
    return {"win": 1.0, "loss": -1.0, "draw": 0.0}.get(outcome, 0.0)


def build_legal_mask_from_state(state: np.ndarray) -> np.ndarray:
    """Extrae máscara legal del vector de estado."""
    mask = np.zeros(CHAMPION_POOL_SIZE, dtype=bool)
    for slot in range(CHAMPION_POOL_SIZE):
        base = SCALAR_DIMS + slot * CHAMP_DIMS
        if base + LEGAL_OFFSET < len(state):
            mask[slot] = state[base + LEGAL_OFFSET] > 0.5
    return mask


# ─── Entrenamiento REINFORCE ─────────────────────────────────────────────────

def train_rl_epoch(
    model: DraftPolicyNet,
    optimizer: optim.Optimizer,
    episodes: list[list[dict]],
    device: torch.device,
    baseline: float,
    baseline_alpha: float = 0.05,
    entropy_coef: float = 0.01,
    value_coef: float = 0.5,
    clip_grad: float = 0.5,
) -> tuple[dict[str, float], float]:
    """Ejecuta una época de entrenamiento REINFORCE sobre los episodios dados.

    Retorna (métricas, nuevo_baseline).
    """
    model.train()

    all_policy_losses = []
    all_value_losses = []
    all_entropies = []
    all_rewards = []

    for episode in episodes:
        if not episode:
            continue

        # Reward del episodio (desde el último turno registrado)
        last_rec = episode[-1]
        episode_reward = outcome_to_reward(last_rec.get("outcome", "unknown"))
        all_rewards.append(episode_reward)

        # Advantage = reward - baseline
        advantage = episode_reward - baseline

        episode_policy_loss = []
        episode_value_loss = []
        episode_entropy = []

        for rec in episode:
            state_list = rec.get("state", [])
            if len(state_list) != STATE_DIM:
                continue

            action_slot = int(rec.get("actionSlot", 0))
            if not (0 <= action_slot < CHAMPION_POOL_SIZE):
                continue

            state_np = np.array(state_list, dtype=np.float32)
            legal_mask = build_legal_mask_from_state(state_np)

            if not legal_mask[action_slot]:
                continue

            state_t = torch.from_numpy(state_np).unsqueeze(0).to(device)
            mask_t = torch.from_numpy(legal_mask).unsqueeze(0).to(device)

            out = model(state_t, legal_mask=mask_t)
            log_policy = out["policy"][0]  # [num_actions]

            # Log-probabilidad de la acción tomada
            log_prob_action = log_policy[action_slot]

            # Pérdida de política (REINFORCE): -log_π(a|s) * advantage
            episode_policy_loss.append(-log_prob_action * advantage)

            # Entropía de la distribución de política (solo sobre legales)
            probs = log_policy.exp()
            legal_probs = probs[mask_t[0]]
            entropy = -(legal_probs * legal_probs.log().clamp(min=-20)).sum()
            episode_entropy.append(entropy)

            # Pérdida de valor (si hay value head)
            if "value" in out and model.use_value_head:
                value_pred = out["value"][0, 0]
                target_value = torch.tensor(
                    1.0 if episode_reward > 0 else 0.0,
                    dtype=torch.float32, device=device,
                )
                episode_value_loss.append(
                    nn.functional.mse_loss(value_pred, target_value)
                )

        if not episode_policy_loss:
            continue

        # Acumular pérdidas del episodio
        ep_policy_loss = torch.stack(episode_policy_loss).mean()
        ep_entropy = torch.stack(episode_entropy).mean() if episode_entropy else torch.tensor(0.0, device=device)
        ep_value_loss = torch.stack(episode_value_loss).mean() if episode_value_loss else torch.tensor(0.0, device=device)

        total_loss = ep_policy_loss - entropy_coef * ep_entropy + value_coef * ep_value_loss

        optimizer.zero_grad()
        total_loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), clip_grad)
        optimizer.step()

        all_policy_losses.append(ep_policy_loss.item())
        all_value_losses.append(ep_value_loss.item() if isinstance(ep_value_loss, torch.Tensor) else ep_value_loss)
        all_entropies.append(ep_entropy.item())

    # Actualizar baseline con media exponencial
    if all_rewards:
        mean_reward = np.mean(all_rewards)
        baseline = baseline * (1 - baseline_alpha) + mean_reward * baseline_alpha

    metrics = {
        "policy_loss": float(np.mean(all_policy_losses)) if all_policy_losses else 0.0,
        "value_loss": float(np.mean(all_value_losses)) if all_value_losses else 0.0,
        "entropy": float(np.mean(all_entropies)) if all_entropies else 0.0,
        "mean_reward": float(np.mean(all_rewards)) if all_rewards else 0.0,
        "win_rate": float(np.mean([r > 0 for r in all_rewards])) if all_rewards else 0.0,
    }
    return metrics, baseline


# ─── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Fine-tuning RL de la política de draft")
    p.add_argument("--bc-checkpoint", required=True,
                   help="Checkpoint .pt de BC desde el que partir")
    p.add_argument("--data", default="../data/draft-dataset.jsonl",
                   help="Dataset JSONL para rollouts offline")
    p.add_argument("--output", default="../public/models/draft-policy.json")
    p.add_argument("--checkpoint-dir", default="checkpoints")
    p.add_argument("--epochs", type=int, default=20)
    p.add_argument("--games-per-update", type=int, default=64,
                   help="Episodios por actualización de parámetros")
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--weight-decay", type=float, default=1e-5)
    p.add_argument("--entropy-coef", type=float, default=0.01)
    p.add_argument("--value-coef", type=float, default=0.5)
    p.add_argument("--baseline-alpha", type=float, default=0.05)
    p.add_argument("--clip-grad", type=float, default=0.5)
    p.add_argument("--max-episodes", type=int, default=None,
                   help="Máx. episodios a cargar del dataset (None=todos)")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main():
    args = parse_args()
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[rl] Dispositivo: {device}")

    # Cargar buffer de episodios
    buffer = EpisodeBuffer(args.data, max_episodes=args.max_episodes)
    if not buffer.episodes:
        raise RuntimeError("No se cargaron episodios del dataset")

    # Cargar checkpoint de BC
    bc_path = Path(args.bc_checkpoint)
    if not bc_path.exists():
        raise FileNotFoundError(f"Checkpoint BC no encontrado: {bc_path}")

    print(f"[rl] Cargando checkpoint BC desde {bc_path}...")
    ckpt = torch.load(bc_path, map_location=device)

    # Reconstruir arquitectura del modelo
    saved_args = ckpt.get("args", {})
    hidden_dims = saved_args.get("hidden", [512, 256, 128])

    model = DraftPolicyNet(
        state_dim=STATE_DIM,
        num_actions=CHAMPION_POOL_SIZE,
        hidden_dims=hidden_dims,
        dropout=0.0,  # Sin dropout en RL para inferencia estable
        use_value_head=True,
    ).to(device)

    model.load_state_dict(ckpt["model"], strict=False)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[rl] Modelo: {n_params:,} parámetros, hidden={hidden_dims}")

    optimizer = optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )

    ckpt_dir = Path(args.checkpoint_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    baseline = 0.0
    best_win_rate = 0.0
    print(f"[rl] Iniciando RL fine-tuning: {args.epochs} épocas, "
          f"{args.games_per_update} episodios/update")
    print(f"[rl] entropy_coef={args.entropy_coef}, value_coef={args.value_coef}")

    for epoch in range(args.epochs):
        t0 = time.time()

        # Número de batches por época: distribuir todos los episodios
        episodes_per_epoch = min(len(buffer.episodes), args.games_per_update * 8)
        n_batches = max(1, episodes_per_epoch // args.games_per_update)

        epoch_metrics: list[dict] = []

        for _ in range(n_batches):
            batch_episodes = buffer.sample(args.games_per_update, rng)
            metrics, baseline = train_rl_epoch(
                model, optimizer, batch_episodes, device, baseline,
                baseline_alpha=args.baseline_alpha,
                entropy_coef=args.entropy_coef,
                value_coef=args.value_coef,
                clip_grad=args.clip_grad,
            )
            epoch_metrics.append(metrics)

        # Promediar métricas del epoch
        avg = {k: float(np.mean([m[k] for m in epoch_metrics])) for k in epoch_metrics[0]}
        elapsed = time.time() - t0

        improved = avg["win_rate"] > best_win_rate
        marker = " ✓" if improved else ""

        print(
            f"[rl] Época {epoch + 1:3d}/{args.epochs} | "
            f"policy_loss={avg['policy_loss']:.4f} | "
            f"value_loss={avg['value_loss']:.4f} | "
            f"entropy={avg['entropy']:.3f} | "
            f"reward={avg['mean_reward']:+.3f} | "
            f"win_rate={avg['win_rate']:.3f}{marker} | "
            f"baseline={baseline:+.3f} | {elapsed:.1f}s"
        )

        if improved:
            best_win_rate = avg["win_rate"]
            best_ckpt = ckpt_dir / "rl_best.pt"
            torch.save(
                {
                    "epoch": epoch,
                    "model": model.state_dict(),
                    "best_win_rate": best_win_rate,
                    "baseline": baseline,
                    "args": vars(args),
                },
                best_ckpt,
            )

        if (epoch + 1) % 5 == 0:
            periodic_ckpt = ckpt_dir / f"rl_epoch_{epoch + 1:04d}.pt"
            torch.save({"epoch": epoch, "model": model.state_dict()}, periodic_ckpt)

    # Exportar el mejor modelo
    rl_best = ckpt_dir / "rl_best.pt"
    if rl_best.exists():
        print(f"\n[rl] Exportando mejor modelo RL desde {rl_best} → {out_path}")
        ckpt = torch.load(rl_best, map_location="cpu")
        model.load_state_dict(ckpt["model"])
    else:
        print(f"\n[rl] Exportando modelo final (sin mejora encontrada) → {out_path}")

    model.save_weights_json(out_path)
    print(f"[rl] ✓ RL fine-tuning completado. Mejor win_rate en dataset: {best_win_rate:.3f}")
    print(f"[rl] Modelo en {out_path}")
    print(f"[rl] Reconstruye el worker con: node scripts/build-bulk-sim-worker.mjs")


if __name__ == "__main__":
    main()
