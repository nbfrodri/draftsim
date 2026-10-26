import { IconCalendar } from "@tabler/icons-react";
import type { SSPhase } from "@/lib/season/ssHistory";
import type { SSReview } from "@/lib/season/types";
import SplitIcon from "../season/SplitIcon";
import EventIdentityIcon from "../tournament/EventIdentityIcon";

export function PhaseIcon({ phase }: { phase: Pick<SSReview, "split" | "event"> }) {
	return phase.split ? <SplitIcon split={phase.split} size={18} /> : phase.event ? <EventIdentityIcon identity={phase} size={18} /> : <IconCalendar size={18} className="text-rift-mutedbright" aria-hidden />;
}

export default function SSPhaseIcons({ phases }: { phases?: readonly SSPhase[] }) {
	if (!phases?.length) return <span title="SS phase not recorded"><PhaseIcon phase={{}} /><span className="sr-only">SS phase not recorded</span></span>;
	return <span className="inline-flex flex-wrap items-center gap-1">{phases.map(phase => <span key={phase.phaseIndex} title={phase.label} className="inline-flex"><PhaseIcon phase={phase} /><span className="sr-only">{phase.label}</span></span>)}</span>;
}
