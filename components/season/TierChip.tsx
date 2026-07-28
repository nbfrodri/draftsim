import type { PlayerTier } from "@/lib/types";

export const TIER_CLS: Record<PlayerTier, string> = {
  "S+": "border-rift-goldbright text-rift-goldbright bg-rift-gold/25",
  S: "border-rift-gold text-rift-goldbright bg-rift-gold/10",
  A: "border-rift-blue/70 text-rift-bluebright bg-rift-blue/10",
  B: "border-rift-line text-rift-mutedbright",
  C: "border-amber-600/50 text-amber-300/80",
  D: "border-rift-red/50 text-rift-redbright bg-rift-red/5",
};

const SIZE_CLS = {
  xs: "w-4 text-[9px] px-0",
  sm: "w-5 text-[10px] px-0",
  md: "min-w-[1.35rem] text-[10px] px-1",
} as const;

/** Compact skill-tier badge used across roster / transfer UI. */
export default function TierChip({
  tier,
  size = "sm",
  className = "",
}: {
  tier: PlayerTier;
  size?: keyof typeof SIZE_CLS;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center border font-display tabular-nums shrink-0 ${SIZE_CLS[size]} ${TIER_CLS[tier]} ${className}`}
      title={`Tier ${tier}`}
    >
      {tier}
    </span>
  );
}
