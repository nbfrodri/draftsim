import { IconTrophy } from "@tabler/icons-react";
import type { InternationalHonor } from "@/lib/season/internationalHonors";

export default function InternationalHonorsBadge({ honor, compact = false }: {
  honor: InternationalHonor | null;
  compact?: boolean;
}) {
  if (!honor) return null;
  const grandSlam = honor === "grand-slam";
  const label = grandSlam ? "International Grand Slam" : "International Triple Crown";
  const description = `${label} — career titles in First Stand, MSI and Worlds${grandSlam ? ", plus Global Cup" : ""}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={description}
      className={`inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 ${grandSlam
        ? "border-rift-goldbright/60 bg-gradient-to-r from-rift-gold/10 to-rift-goldbright/20 text-rift-goldbright"
        : "border-rift-bluebright/50 bg-rift-blue/10 text-rift-bluebright"}`}
    >
      <IconTrophy size={compact ? 11 : 14} stroke={1.6} aria-hidden />
      <span className={`${compact ? "text-[8px]" : "text-[9px]"} font-semibold uppercase tracking-[0.1em]`}>
        {compact ? grandSlam ? "4/4" : "3/3" : grandSlam ? "Grand Slam · 4/4" : "Triple Crown · 3/3"}
      </span>
    </span>
  );
}
