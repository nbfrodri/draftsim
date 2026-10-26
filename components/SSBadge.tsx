import { Fragment } from "react";

const SIZE_CLS = {
	// Scales with the surrounding text so headings, table headers and small copy stay balanced.
	text: "h-[1.35em] min-w-[1.35em] px-[0.2em] text-[0.72em] align-[-0.2em]",
	xs: "w-4 h-4 text-[9px]",
	sm: "w-5 h-5 text-[10px]",
	md: "w-6 h-6 text-[11px]",
} as const;

/** The visual chip is decorative; the hidden text preserves inline accessible names. */
export default function SSBadge({ size = "text", className = "" }: {
	size?: keyof typeof SIZE_CLS;
	className?: string;
}) {
	return <><span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-sm border border-cyan-200 bg-cyan-300/15 font-display leading-none tracking-normal text-cyan-100 ${size === "text" ? "" : "align-middle"} ${SIZE_CLS[size]} ${className}`}>SS</span><span className="sr-only">SS</span></>;
}

/** Render SS mentions in display copy supplied by domain helpers, leaving the source text intact. */
export function withSSBadge(text: string) {
	return text.split(/(\bSS\b)/).map((part, index) => part === "SS" ? <SSBadge key={index} /> : <Fragment key={index}>{part}</Fragment>);
}
