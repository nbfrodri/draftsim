"""Script de exportación standalone para convertir un checkpoint .pt a JSON.

Útil para exportar un checkpoint guardado durante el entrenamiento sin
necesidad de repetir todo el pipeline.

Uso:
  python export.py --checkpoint checkpoints/best.pt --output ../public/models/draft-policy.json
  python export.py --checkpoint checkpoints/epoch_0050.pt --output ../public/models/draft-policy-epoch50.json
"""

import argparse
from pathlib import Path

import torch

from model import DraftPolicyNet


def parse_args():
    p = argparse.ArgumentParser(description="Exportar checkpoint a JSON de pesos")
    p.add_argument(
        "--checkpoint",
        required=True,
        help="Ruta al archivo .pt del checkpoint (guardado por train_bc.py)",
    )
    p.add_argument(
        "--output",
        required=True,
        help="Ruta de salida del archivo JSON de pesos",
    )
    p.add_argument(
        "--hidden",
        nargs="+",
        type=int,
        default=None,
        help="Arquitectura oculta del modelo (si no está en el checkpoint)",
    )
    p.add_argument(
        "--no-value-head",
        action="store_true",
        help="Exportar sin cabeza de valor",
    )
    return p.parse_args()


def main():
    args = parse_args()

    ckpt_path = Path(args.checkpoint)
    out_path = Path(args.output)

    if not ckpt_path.exists():
        raise FileNotFoundError(f"Checkpoint no encontrado: {ckpt_path}")

    print(f"[export] Cargando checkpoint desde {ckpt_path}...")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)

    # Intentar reconstruir la arquitectura desde los args del checkpoint
    saved_args = ckpt.get("args", {})
    hidden_dims = args.hidden or saved_args.get("hidden", [512, 256, 128])
    use_value = not args.no_value_head

    model = DraftPolicyNet(
        hidden_dims=hidden_dims,
        use_value_head=use_value,
    )

    state_dict = ckpt["model"] if "model" in ckpt else ckpt
    model.load_state_dict(state_dict, strict=False)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_weights_json(out_path)

    print(f"[export] ✓ Exportado a {out_path}")
    epoch = ckpt.get("epoch", "?")
    val_loss = ckpt.get("best_val_loss", "?")
    print(f"[export]   Época: {epoch}  |  Val loss: {val_loss}")


if __name__ == "__main__":
    main()

