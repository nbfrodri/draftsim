import type { Lane } from "./types";

export const LANES: { key: Lane; label: string }[] = [
  { key: "top", label: "Toplane" },
  { key: "jungle", label: "Jungle" },
  { key: "middle", label: "Midlane" },
  { key: "bottom", label: "Adc" },
  { key: "support", label: "Support" },
];

// Meraki Analytics uses uppercase lane names — normalize to our Lane type.
export const MERAKI_POSITION_TO_LANE: Record<string, Lane> = {
  TOP: "top",
  JUNGLE: "jungle",
  MIDDLE: "middle",
  BOTTOM: "bottom",
  SUPPORT: "support",
};
