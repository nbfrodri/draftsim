import type { ReactNode } from "react";

export function PlayerIdentity({ badge, name, teams }: { badge?: ReactNode; name: ReactNode; teams: ReactNode }) {
	return (
		<div className="min-w-0 space-y-1.5">
			<div className="flex items-center gap-1.5 font-display text-[13px] text-rift-goldbright">
				{badge}
				{name}
			</div>
			{teams}
		</div>
	);
}

export function PlayerMetrics({ metrics, className = "grid-cols-2" }: { metrics: readonly (readonly [label: string, short: string, value: string])[]; className?: string }) {
	return (
		<dl className={`grid gap-x-3 gap-y-2.5 tabular-nums ${className}`}>
			{metrics.map(([label, short, value]) => (
				<div key={label}>
					<dt className="text-[10px] text-rift-mutedbright"><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></dt>
					<dd className="mt-0.5 font-display text-[13px] text-rift-goldbright">{value}</dd>
				</div>
			))}
		</dl>
	);
}
