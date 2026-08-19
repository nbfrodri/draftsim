"""Entrenamiento behavior cloning de la política de draft.

Aprende a imitar las decisiones de la IA heurística (el "profesor") minimizando
la cross-entropy entre la distribución del modelo y la acción one-hot del profesor.
También añade una pérdida de valor (MSE contra el outcome 0/1) cuando
use_value_head=True — esto sirve como señal de refuerzo débil adicional.

Uso:
  cd training
  python train_bc.py \
    --data ../data/draft-dataset.jsonl \
    --output ../public/models/draft-policy.json \
    --epochs 50 \
    --batch 256

El script exporta automáticamente el mejor checkpoint (menor val-loss) a
--output al finalizar el entrenamiento.
"""

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR

from dataset import DraftDataset, make_dataloaders
from model import DraftPolicyNet


# ─── Pérdida combinada ───────────────────────────────────────────────────────

def compute_loss(
    model: DraftPolicyNet,
    states: torch.Tensor,
    targets: torch.Tensor,
    legal_masks: torch.Tensor,
    value_weight: float = 0.1,
) -> dict[str, torch.Tensor]:
    """Calcula la pérdida de política (BC) y de valor (opcional).

    Retorna un dict con las pérdidas individuales y la pérdida total.
    """
    out = model(states, legal_mask=legal_masks)
    log_policy = out["policy"]

    # Pérdida de política: NLL (cross-entropy sobre el target del profesor)
    policy_loss = nn.functional.nll_loss(log_policy, targets)

    total_loss = policy_loss
    result = {"policy_loss": policy_loss}

    # Pérdida de valor: MSE entre la predicción del valor y el outcome
    if "value" in out and model.use_value_head:
        # outcome está codificado en los metadatos del dataset (0/1)
        # Aquí usamos la distribución del profesor como proxy: si el modelo
        # elige el mismo campeón que el profesor, se espera que el outcome
        # sea similar. No tenemos acceso directo al outcome en el batch sin
        # cargarlo explícitamente — añadirlo al __getitem__ del dataset.
        # Por ahora omitimos la pérdida de valor si no tenemos el tensor;
        # el script puede extenderse para incluirlo.
        pass

    result["total"] = total_loss
    return result


# ─── Evaluación ─────────────────────────────────────────────────────────────

@torch.no_grad()
def evaluate(
    model: DraftPolicyNet,
    loader,
    device: torch.device,
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

        losses = compute_loss(model, states, targets, legal_masks)
        bs = states.size(0)
        total_loss += losses["total"].item() * bs

        # Top-1 y Top-5 accuracy
        out = model(states, legal_mask=legal_masks)
        logits = out["logits"]  # [B, N]
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
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--hidden", nargs="+", type=int, default=[512, 256, 128])
    p.add_argument("--dropout", type=float, default=0.1)
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

    # Contar parámetros
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[train] Modelo: {n_params:,} parámetros, hidden={args.hidden}")

    optimizer = optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    start_epoch = 0
    best_val_loss = float("inf")

    # Reanudar desde checkpoint
    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        scheduler.load_state_dict(ckpt["scheduler"])
        start_epoch = ckpt["epoch"] + 1
        best_val_loss = ckpt.get("best_val_loss", float("inf"))
        print(f"[train] Reanudando desde época {start_epoch}, best_val={best_val_loss:.4f}")

    ckpt_dir = Path(args.checkpoint_dir)
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"[train] {len(train_loader.dataset)} train / {len(val_loader.dataset)} val")
    print(f"[train] Épocas: {args.epochs}, LR: {args.lr}, batch: {args.batch}")

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
            losses = compute_loss(model, states, targets, legal_masks)
            losses["total"].backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            bs = states.size(0)
            epoch_loss += losses["total"].item() * bs
            n_train += bs

        scheduler.step()

        train_loss = epoch_loss / n_train
        val_metrics = evaluate(model, val_loader, device)
        elapsed = time.time() - t0

        print(
            f"[train] Época {epoch + 1:3d}/{start_epoch + args.epochs} | "
            f"train_loss={train_loss:.4f} | "
            f"val_loss={val_metrics['loss']:.4f} | "
            f"top1={val_metrics['top1']:.3f} | "
            f"top5={val_metrics['top5']:.3f} | "
            f"lr={scheduler.get_last_lr()[0]:.2e} | "
            f"{elapsed:.1f}s"
        )

        # Guardar mejor checkpoint
        if val_metrics["loss"] < best_val_loss:
            best_val_loss = val_metrics["loss"]
            best_ckpt = ckpt_dir / "best.pt"
            torch.save(
                {
                    "epoch": epoch,
                    "model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "scheduler": scheduler.state_dict(),
                    "best_val_loss": best_val_loss,
                    "args": vars(args),
                },
                best_ckpt,
            )
            print(f"[train]   ✓ Nuevo mejor val_loss={best_val_loss:.4f} → {best_ckpt}")

        # Checkpoint periódico cada 10 épocas
        if (epoch + 1) % 10 == 0:
            periodic_ckpt = ckpt_dir / f"epoch_{epoch + 1:04d}.pt"
            torch.save({"epoch": epoch, "model": model.state_dict()}, periodic_ckpt)

    # Exportar el mejor modelo a JSON
    print(f"\n[train] Exportando mejor modelo desde {ckpt_dir}/best.pt → {out_path}")
    best_ckpt = ckpt_dir / "best.pt"
    if best_ckpt.exists():
        ckpt = torch.load(best_ckpt, map_location="cpu")
        model.load_state_dict(ckpt["model"])

    model.save_weights_json(out_path)
    print(f"[train] ✓ Entrenamiento completado. Modelo en {out_path}")
    print(f"[train]   Top-1 accuracy final en val: {val_metrics['top1']:.3f}")
    print(f"[train]   Coloca el archivo en public/models/draft-policy.json")
    print(f"[train]   y configura MODEL_PATH=public/models/draft-policy.json en .env.local")


if __name__ == "__main__":
    main()
