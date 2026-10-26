import { TIER_CLS } from "@/components/season/TierChip";

const SIZE_CLS = {
	text: "",
	xs: "text-[9px]",
	sm: "text-[10px]",
	md: "text-[11px]",
} as const;

/** The visual chip is decorative; the hidden text preserves inline accessible names.
 * Baseline alignment puts its letters on the surrounding text baseline, so inline
 * after text it is centred on the capitals; flex parents centre it themselves. */
export default function SSBadge({ size = "text", className = "" }: {
	size?: keyof typeof SIZE_CLS;
	className?: string;
}) {
	return <><span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center border font-display tabular-nums leading-none tracking-normal h-[1.35em] min-w-[1.5em] px-[0.25em] align-baseline ${TIER_CLS.SS} ${SIZE_CLS[size]} ${className}`}>SS</span><span className="sr-only">SS</span></>;
}
