import type { Player, PlayerTier, SSPlayerEvidence } from "./types";

export function developmentTier(player: Pick<Player, "tier" | "ss">): Exclude<PlayerTier, "SS"> {
	if (player.tier !== "SS") return player.tier;
	return player.ss?.baseTier === "S+" ? "S+" : "S";
}

export function withoutSS(player: Player): Player {
	if (player.tier !== "SS" && !player.ss) return player;
	const { ss: _ss, ...rest } = player;
	return { ...rest, tier: developmentTier(player) };
}

export function withDevelopmentTier(player: Player, tier: PlayerTier): Player {
	if (player.tier === "SS" && player.ss && (tier === "S" || tier === "S+")) {
		return { ...player, ss: { ...player.ss, baseTier: tier } };
	}
	return { ...withoutSS(player), tier: tier === "SS" ? "S" : tier };
}

export function validSSEvidence(value: unknown): value is SSPlayerEvidence {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	return (v.baseTier === "S" || v.baseTier === "S+") &&
		["top", "jungle", "middle", "bottom", "support"].includes(v.lane as string) &&
		typeof v.seasonId === "string" && v.seasonId.length > 0 &&
		typeof v.phaseLabel === "string" && v.phaseLabel.length > 0 &&
		Number.isSafeInteger(v.phaseIndex) && (v.phaseIndex as number) >= 0 &&
		typeof v.score === "number" && Number.isFinite(v.score) && v.score >= 1 && v.score <= 10 &&
		Number.isSafeInteger(v.games) && (v.games as number) >= 8;
}
