import { IconChartBar } from "@tabler/icons-react";
import type { EventRecord } from "@/lib/season/eventHistory";
import LeagueIcon from "../LeagueIcon";
import RegionMark from "../RegionMark";
import SplitIcon from "../season/SplitIcon";

export default function EventIdentityIcon({ identity, size = 16 }: { identity: Pick<EventRecord, "event" | "leagueId" | "split">; size?: number }) {
	if (identity.event) return <LeagueIcon league={identity.event} size={size} className="shrink-0" />;
	if (identity.leagueId) return <span className="inline-flex shrink-0 items-center gap-1"><RegionMark league={identity.leagueId} size={size} />{identity.split && <SplitIcon split={identity.split} size={Math.max(10, size - 4)} />}</span>;
	return <IconChartBar size={size} className="shrink-0 text-rift-gold" aria-hidden="true" />;
}
