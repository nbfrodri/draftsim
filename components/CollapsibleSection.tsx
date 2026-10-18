"use client";

import { useId, useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold";

// Closed-by-default disclosure: body mounts on first open; keepMounted retains it after closing.
export default function CollapsibleSection({ label, ariaLabel, icon, summary, children, className = "my-3", headingClassName = "font-display text-[10px] uppercase tracking-[0.25em]", keepMounted = false, headingLevel = 3 }: { label: ReactNode; ariaLabel?: string; icon?: ReactNode; summary?: ReactNode; children: ReactNode; className?: string; headingClassName?: string; keepMounted?: boolean; headingLevel?: 2 | 3 | 4 }) {
	const [open, setOpen] = useState(false);
	const [opened, setOpened] = useState(false);
	const mounted = open || (keepMounted && opened);
	const bodyId = useId();
	const Heading = headingLevel === 4 ? "h4" : headingLevel === 2 ? "h2" : "h3";
	return <section aria-label={ariaLabel} className={`min-w-0 ${className}`}>
		<Heading>
			<button type="button" aria-expanded={open} aria-controls={mounted ? bodyId : undefined} onClick={() => { setOpen(!open); if (!open) setOpened(true); }}
				className={`flex w-full items-center gap-2.5 border px-3 py-2.5 text-left transition-colors ${FOCUS} ${open ? "border-rift-gold/40 bg-rift-gold/[0.06] text-rift-goldbright" : "border-rift-line/50 bg-rift-bg/40 text-rift-mutedbright hover:border-rift-gold/50 hover:text-rift-goldbright"}`}>
				{icon}
				<span className={`min-w-0 flex-1 truncate ${headingClassName}`}>{label}</span>
				{summary && <span className="min-w-0 max-w-[50%] shrink-0 truncate text-[10px] font-body font-normal normal-case tracking-normal tabular-nums text-rift-mutedbright">{summary}</span>}
				<IconChevronDown size={14} className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} aria-hidden="true" />
			</button>
		</Heading>
		{mounted && <div id={bodyId} hidden={!open} className="border border-t-0 border-rift-line/40 bg-rift-bg/20">{children}</div>}
	</section>;
}
