"use client";

import {
  IconFlower,
  IconSnowflake,
  IconSun,
} from "@tabler/icons-react";
import type { SplitId } from "@/lib/season/types";

const SPLIT_ICONS = {
  winter: IconSnowflake,
  spring: IconFlower,
  summer: IconSun,
} as const;

export default function SplitIcon({
  split,
  size = 13,
  className = "text-rift-gold/65 flex-shrink-0",
}: {
  split: SplitId;
  size?: number;
  className?: string;
}) {
  const Icon = SPLIT_ICONS[split];
  return (
    <Icon
      size={size}
      stroke={1.6}
      className={className}
      aria-hidden
    />
  );
}
