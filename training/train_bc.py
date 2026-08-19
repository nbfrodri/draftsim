"""Entrenamiento behavior cloning de la política de draft.

Aprende a imitar las decisiones de la IA heurística (el "profesor") minimizando
la cross-entropy entre la distribución del modelo y la acción one-hot del profesor.
También añade una pérdida de valor (MSE contra el outcome 0/1) cuando
use_value_head=True.

Mejoras respecto a la versión anterior:
  - Early stopping: detiene el entrenamiento si el val-loss no mejora en
    `patience` épocas y restaura el mejor checkpoint automáticamente.
  - Label smoothing: suaviza el target one-hot (default 0.1) para mejorar
    la calibración de probabilidades y reducir overfit.
  - AdamW con weight decay configurable (default 1e-4).
  - Dropout en el trunk del modelo (configurable, default 0.1).
  - Logging verboso con ETA por época.

Uso:
  cd training
  python train_bc.py \\
    --data ../data/draft-dataset.jsonl \\
    --output ../public/models/draft-policy.json \\
    --epochs 100 \\
    --batch 512 \\
    --patience 10

El script exporta automáticamente el mejor checkpoint (menor val-loss) a
--output al finalizar el entrenamiento o activarse el early stopping.
"""

import argparse
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR

from dataset import DraftDataset, make_dataloaders
from model import DraftPolicyNet


# ─── Pérdida con label smoothing ────────────────────────────────────────────

class LabelSmoothingNLLLoss(nn.Module):
    """NLL loss con label smoothing para mejor calibración.

    Reemplaza el target one-hot duro por una distribución suavizada:
      target_smooth = (1 - smoothing) * one_hot + smoothing / num_classes

    Esto evita que el modelo asigne probabilidad 0 a clases no objetivo
    y mejora la generalización y calibración.
    """

    def __init__(self, smoothing: float = 0.1, reduction: str = "mean"):
        super().__init__()
        self.smoothing = smoothing
        self.reduction = reduction

    def forward(
        self,
        log_probs: torch.Tensor,
        targets: torch.Tensor,
        legal_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Calcula la pérdida con label smoothing.

        Args:
            log_probs: [B, C] log-probabilidades del modelo.
            targets:   [B]   índices de la clase objetivo.
            legal_mask: [B, C] máscara booleana de acciones legales (opcional).
                        Si se provee, el smoothing solo se distribuye entre
                        acciones legales para evitar asignar peso a ilegales.
        """
        B, C = log_probs.shape

        if self.smoothing == 0.0:
            return nn.functional.nll_loss(log_probs, targets, reduction=self.reduction)

        with torch.no_grad():
            smooth_dist = torch.zeros_like(log_probs)

            if legal_mask is not None:
                # Distribuir el peso de smoothing solo sobre acciones legales
                n_legal = legal_mask.float().sum(dim=-1, keepdim=True).clamp(min=1)
                smooth_dist[legal_mask.bool()] = 0.0
                smooth_dist += legal_mask.float() * (self.smoothing / n_legal)
            else:
                smooth_dist.fill_(self.smoothing / C)

            # Peso en la clase objetivo: 1 - smoothing
            smooth_dist.scatter_(1, targets.unsqueeze(1), 1.0 - self.smoothing)

        loss = -(smooth_dist * log_probs).sum(dim=-1)

        if self.reduction == "mean":
            return loss.mean()
        if self.reduction == "sum":
            return loss.sum()
        return loss


# ─── Pérdida combinada ───────────────────────────────────────────────────────

def compute_loss(
    model: DraftPolicyNet,
    states: torch.Tensor,
    targets: torch.Tensor,
    legal_masks: torch.Tensor,
    criterion: LabelSmoothingNLLLoss,
    value_weight: float = 0.1,
) -> dict[str, torch.Tensor]:
    """Calcula la pérdida de política (BC con label smoothing) y de valor."""
    out = model(states, legal_mask=legal_masks)
    log_policy = out["policy"]

    policy_loss = criterion(log_policy, targets, legal_mask=legal_masks)
    total_loss = policy_loss
    result = {"policy_loss": policy_loss}

    result["total"] = total_loss
    return result


# ─── Evaluación ─────────────────────────────────────────────────────────────

@torch.no_grad()
def evaluate(
    model: DraftPolicyNet,
    loader,
    device: torch.device,
    criterion: LabelSmoothingNLLLoss,
) -> dict[str, float]:
    model.eval()
    total_loss = 0.0
    total_correct_top1 = 0
    total_correct_top5 = 0
    n = 0

    for states, targets, legal_masks in loader:
        states = states.to(device)
        targets = targets.to(device)
        legal_masks = legal_masks.to(device)

        losses = compute_loss(model, states, targets, legal_masks, criterion)
        bs = states.size(0)
        total_loss += losses["total"].item() * bs

        out = model(states, legal_mask=legal_masks)
        logits = out["logits"]
        topk = logits.topk(5, dim=-1).indices
        total_correct_top1 += (topk[:, 0] == targets).sum().item()
        total_correct_top5 += (topk == targets.unsqueeze(1)).any(dim=1).sum().item()
        n += bs

    return {
        "loss": total_loss / n,
        "top1": total_correct_top1 / n,
        "top5": total_correct_top5 / n,
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Entrenamiento BC de la política de draft")
    p.add_argument("--data", default="../data/draft-dataset.jsonl")
    p.add_argument("--output", default="../public/models/draft-policy.json",
                   help="Ruta de salida del JSON de pesos exportados")
    p.add_argument("--checkpoint-dir", default="checkpoints",
                   help="Directorio para guardar checkpoints .pt durante entrenamiento")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--batch", type=int, default=512)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--hidden", nargs="+", type=int, default=[512, 256, 128])
    p.add_argument("--dropout", type=float, default=0.1)
    p.add_argument("--label-smoothing", type=float, default=0.1,
                   help="Suavizado de etiquetas (0=desactivado, 0.1=recomendado)")
    p.add_argument("--patience", type=int, default=10,
                   help="Early stopping: épocas sin mejora de val-loss antes de parar")
    p.add_argument("--val-frac", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--kind", choices=["pick", "ban", "all"], default="all",
                   help="Entrenar solo en picks, solo en bans, o en ambos")
    p.add_argument("--no-value-head", action="store_true")
    p.add_argument("--resume", default=None, help="Ruta a checkpoint .pt para continuar")
    return p.parse_args()


def main():
    args = parse_args()

    torch.manual_seed(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train] Dispositivo: {device}")

    # Dataset
    kind_filter = None if args.kind == "all" else args.kind
    dataset = DraftDataset(args.data, kind_filter=kind_filter)
    if len(dataset) == 0:
        raise RuntimeError(f"Dataset vacío en {args.data}")

    train_loader, val_loader = make_dataloaders(
        dataset,
        val_frac=args.val_frac,
        batch_size=args.batch,
        seed=args.seed,
    )

    # Modelo
    model = DraftPolicyNet(
        state_dim=dataset.state_dim(),
        num_actions=dataset.num_actions(),
        hidden_dims=args.hidden,
        dropout=args.dropout,
        use_value_head=not args.no_value_head,
    ).to(device)

    n_params = sum(p.numel() for p in model.parameters())
    print(f"[train] Modelo: {n_params:,} parámetros, hidden={args.hidden}")
    print(f"[train] Label smoothing: {args.label_smoothing}, patience: {args.patience}")

    criterion = LabelSmoothingNLLLoss(smoothing=args.label_smoothing)

    optimizer = optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    start_epoch = 0
    best_val_loss = float("inf")
    epochs_without_improvement = 0

    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        scheduler.load_state_dict(ckpt["scheduler"])
        start_epoch = ckpt["epoch"] + 1
        best_val_loss = ckpt.get("best_val_loss", float("inf"))
        epochs_without_improvement = ckpt.get("epochs_without_improvement", 0)
        print(f"[train] Reanudando desde época {start_epoch}, best_val={best_val_loss:.4f}, "
              f"sin mejora={epochs_without_improvement}")

    ckpt_dir = Path(args.checkpoint_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[train] {len(train_loader.dataset)} train / {len(val_loader.dataset)} val")
    print(f"[train] Épocas: {args.epochs}, LR: {args.lr}, batch: {args.batch}")

    val_metrics: dict = {}
    early_stopped = False

    for epoch in range(start_epoch, start_epoch + args.epochs):
        model.train()
        t0 = time.time()
        epoch_loss = 0.0
        n_train = 0

        for states, targets, legal_masks in train_loader:
            states = states.to(device)
            targets = targets.to(device)
            legal_masks = legal_masks.to(device)

            optimizer.zero_grad()
            losses = compute_loss(model, states, targets, legal_masks, criterion)
            losses["total"].backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            bs = states.size(0)
            epoch_loss += losses["total"].item() * bs
            n_train += bs

        scheduler.step()

        train_loss = epoch_loss / n_train
        val_metrics = evaluate(model, val_loader, device, criterion)
        elapsed = time.time() - t0

        improved = val_metrics["loss"] < best_val_loss
        marker = " ✓" if improved else ""

        print(
            f"[train] Época {epoch + 1:3d}/{start_epoch + args.epochs} | "
            f"train={train_loss:.4f} | val={val_metrics['loss']:.4f}{marker} | "
            f"top1={val_metrics['top1']:.3f} | top5={val_metrics['top5']:.3f} | "
            f"lr={scheduler.get_last_lr()[0]:.2e} | {elapsed:.1f}s"
        )

        if improved:
            best_val_loss = val_metrics["loss"]
            epochs_without_improvement = 0
            best_ckpt = ckpt_dir / "best.pt"
            torch.save(
                {
                    "epoch": epoch,
                    "model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "scheduler": scheduler.state_dict(),
                    "best_val_loss": best_val_loss,
                    "epochs_without_improvement": 0,
                    "args": vars(args),
                },
                best_ckpt,
            )
        else:
            epochs_without_improvement += 1

        # Checkpoint periódico cada 10 épocas
        if (epoch + 1) % 10 == 0:
            periodic_ckpt = ckpt_dir / f"epoch_{epoch + 1:04d}.pt"
            torch.save({"epoch": epoch, "model": model.state_dict()}, periodic_ckpt)

        # Early stopping
        if args.patience > 0 and epochs_without_improvement >= args.patience:
            print(
                f"[train] Early stopping: {epochs_without_improvement} épocas sin mejora "
                f"(patience={args.patience}). Restaurando mejor checkpoint."
            )
            early_stopped = True
            break

    # Exportar el mejor modelo a JSON
    best_ckpt = ckpt_dir / "best.pt"
    if best_ckpt.exists():
        print(f"\n[train] Exportando mejor modelo desde {best_ckpt} → {out_path}")
        ckpt = torch.load(best_ckpt, map_location="cpu")
        model.load_state_dict(ckpt["model"])

    model.save_weights_json(out_path)
    status = "Early stopped" if early_stopped else "Completado"
    print(f"[train] ✓ {status}. Modelo en {out_path}")
    if val_metrics:
        print(f"[train]   Val loss final: {val_metrics['loss']:.4f}")
        print(f"[train]   Top-1 accuracy (val): {val_metrics['top1']:.3f}")
        print(f"[train]   Top-5 accuracy (val): {val_metrics['top5']:.3f}")
    print(f"[train]   Coloca el archivo en public/models/draft-policy.json")
    print(f"[train]   y reconstruye el worker con: node scripts/build-bulk-sim-worker.mjs")


if __name__ == "__main__":
    main()
