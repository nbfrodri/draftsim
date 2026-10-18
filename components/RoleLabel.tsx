import type { Lane } from "@/lib/types";
import { roleLabel } from "@/lib/roles";
import LaneIcon from "./LaneIcon";

export default function RoleLabel({ lane, size = "xs", className = "" }: { lane: Lane; size?: "xs" | "sm" | "md"; className?: string }) {
	return <span className={`inline-flex items-center gap-1 ${className}`}><LaneIcon lane={lane} size={size} /><span>{roleLabel(lane)}</span></span>;
}
