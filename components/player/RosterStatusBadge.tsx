import { MARKET_STATUS_LABELS, type MarketStatus } from "@/lib/season/marketHistory";

const colors: Record<MarketStatus, string> = {
  main: "text-rift-goldbright border-rift-gold/40 bg-rift-gold/10", academy: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  "free-agent": "text-sky-300 border-sky-500/40 bg-sky-500/10", rookie: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  retired: "text-rift-redbright border-rift-red/40 bg-rift-red/10", unknown: "text-rift-mutedbright border-rift-line",
};

/** Shared live/Hall roster identity colors; no inferred tenure or status. */
export default function RosterStatusBadge({ status }: { status: MarketStatus }) {
  return <span className={`inline-flex shrink-0 whitespace-nowrap border px-1.5 py-0.5 text-[10px] ${colors[status]}`}>{MARKET_STATUS_LABELS[status]}</span>;
}
