import type { Lane } from "@/lib/types";
import { roleLabel } from "@/lib/roles";
import LaneIcon from "./LaneIcon";

export default function RoleLabel({ lane, size = "xs", iconOnly = false, className = "" }: { lane: Lane; size?: "xs" | "sm" | "md"; iconOnly?: boolean; className?: string }) {
	return <span className={`inline-flex items-center gap-1 ${className}`}><LaneIcon lane={lane} size={size} /><span className={iconOnly ? "sr-only" : undefined}>{roleLabel(lane)}</span></span>;
}
