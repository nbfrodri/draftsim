/** Lightweight pending shell — rift gold spinner + skeleton bars. */
export default function HallPanelLoading({ label }: { label: string }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center py-16 md:py-20 border border-rift-line/40 bg-rift-panel/25 min-h-[280px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="absolute top-0 left-0 w-2 h-2 rotate-45 bg-rift-gold/50"
        aria-hidden
      />
      <span
        className="absolute top-0 right-0 w-2 h-2 rotate-45 bg-rift-gold/50"
        aria-hidden
      />
      <div className="flex items-center justify-center mb-4">
        <div className="w-7 h-7 border-2 border-rift-gold/25 border-t-rift-goldbright rounded-full animate-spin" />
      </div>
      <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70 mb-5">
        {label}
      </div>
      <div className="w-full max-w-xs space-y-2 px-6" aria-hidden>
        <div className="h-2 bg-rift-gold/10 animate-pulse" />
        <div className="h-2 w-[80%] mx-auto bg-rift-gold/[0.07] animate-pulse [animation-delay:150ms]" />
        <div className="h-2 w-[55%] mx-auto bg-rift-gold/[0.05] animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}
