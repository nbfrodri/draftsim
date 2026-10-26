"use client";

import type { ReactNode } from "react";

/** Shared icon filters with a single tab stop and radio-group arrow navigation. */
export default function ChipRow({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; icon?: ReactNode }[]; onChange: (value: string) => void }) {
	return <fieldset role="radiogroup" aria-label={label} className="m-0 min-w-0 border-0 p-0" onKeyDown={event => {
		if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
		const index = buttons.indexOf(event.target as HTMLButtonElement);
		const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
		buttons[next]?.focus();
		if (options[next]) onChange(options[next].value);
	}}>
		<legend className="mb-1.5 text-[10px] text-rift-mutedbright">{label}</legend>
		<div className="flex flex-wrap gap-1.5">{options.map(option => <button key={option.value} type="button" role="radio" aria-label={option.label} aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} onClick={() => onChange(option.value)} className={`inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rift-gold ${option.value === value ? "border-rift-gold/50 bg-rift-gold/10 text-rift-goldbright" : "border-rift-line/50 text-rift-mutedbright hover:border-rift-gold/40 hover:text-rift-goldbright"}`}>{option.icon}{option.label}</button>)}</div>
	</fieldset>;
}
