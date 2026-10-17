import type { Lane } from "./types";

export const ROLE_LABELS: Record<Lane, string> = {
	top: "Top", jungle: "Jungle", middle: "Mid", bottom: "ADC", support: "Support",
};

export const roleLabel = (lane: Lane): string => ROLE_LABELS[lane];
