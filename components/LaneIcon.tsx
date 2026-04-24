import type { Lane } from "@/lib/types";

// Riot's lane position icons from CommunityDragon (support = "utility").
const LANE_ICON_URL: Record<Lane, string> = {
  top: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-top.png",
  jungle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-jungle.png",
  middle: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-middle.png",
  bottom: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-bottom.png",
  support: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-utility.png",
};

interface Props {
  lane: Lane;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "w-3 h-3",
  sm: "w-3.5 h-3.5 md:w-4 md:h-4",
  md: "w-4 h-4 md:w-5 md:h-5",
};

export default function LaneIcon({ lane, size = "sm", className = "" }: Props) {
  return (
    <img
      src={LANE_ICON_URL[lane]}
      alt={lane}
      aria-hidden
      className={`${SIZE[size]} shrink-0 ${className}`}
    />
  );
}
