import type { OutlookProgress } from "@/lib/season/rosterOutlookView";

export default function RosterOutlookLoading({ progress, message }: { progress?: OutlookProgress; message?: string }) {
  return <div className="mt-4 min-h-[300px] border border-rift-line/40 bg-rift-panel/20 p-4 md:p-5" aria-busy="true">
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-2 border-rift-gold/20 border-t-rift-gold motion-safe:animate-spin" />
      <div className="min-w-0 flex-1">
        <p role="status" className="text-xs font-medium text-rift-goldbright">{message ?? "Calculating roster probabilities"}</p>
        <p className="mt-1 text-[11px] text-rift-mutedbright">{message ? "The outlook will be ready when this step finishes." : "Evaluating the next roster window with the current season data."}</p>
      </div>
      {!message && <span className="shrink-0 text-[11px] tabular-nums text-rift-goldbright">{progress ? `${progress.completed} / ${progress.total}` : "Preparing…"}</span>}
    </div>
    {!message && <div role="progressbar" aria-label="Roster forecast scenarios" aria-valuemin={0} aria-valuemax={progress?.total ?? 160} aria-valuenow={progress?.completed}
      className="mt-4 h-1.5 overflow-hidden bg-rift-line/60">
      <div className={`h-full bg-rift-gold/70 ${progress ? "transition-[width] motion-reduce:transition-none" : "w-1/3 motion-safe:animate-pulse"}`}
        style={progress ? { width: `${100 * progress.completed / progress.total}%` } : undefined} />
    </div>}
    <div aria-hidden="true" className="mt-5 space-y-3 motion-safe:animate-pulse">
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="flex items-center gap-5 border-t border-rift-line/40 pt-3">
        <div className="h-7 w-7 bg-rift-gold/[0.07]" />
        <div className="flex-1 space-y-2"><div className="h-2 w-24 bg-rift-gold/10" /><div className="h-1.5 w-36 bg-rift-line/70" /></div>
        {Array.from({ length: 5 }, (_, j) => <div key={j} className="hidden h-2 w-9 bg-rift-gold/[0.07] sm:block" />)}
      </div>)}
    </div>
  </div>;
}
