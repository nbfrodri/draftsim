"use client";

type Props = {
  ornament: string;
  message: string;
  /** Fixed full-screen overlay (exit) vs in-flow shell (startup). */
  overlay?: boolean;
  status?: "busy" | "error";
  "aria-label": string;
};

/**
 * Shared branded shell for startup and shutdown — rift-gold typography,
 * spinner, and ornament line used by boot and close overlays.
 */
export default function AppLifecycleShell({
  ornament,
  message,
  overlay = false,
  status = "busy",
  "aria-label": ariaLabel,
}: Props) {
  const spinnerClass =
    status === "error"
      ? "w-8 h-8 border-2 border-red-400/30 border-t-red-300/80 rounded-full"
      : "w-8 h-8 border-2 border-rift-gold/25 border-t-rift-goldbright rounded-full animate-spin";

  return (
    <div
      className={
        overlay
          ? "fixed inset-0 z-[10000] flex flex-col items-center justify-center px-4 py-12 bg-rift-bg/95 backdrop-blur-[2px]"
          : "min-h-screen flex flex-col items-center justify-center px-4 py-12"
      }
      role="status"
      aria-live="polite"
      aria-busy={status === "busy"}
      aria-label={ariaLabel}
    >
      <div className="w-full max-w-md text-center">
        <div className="text-[10px] md:text-xs uppercase tracking-[0.5em] text-rift-gold/70 mb-2">
          DraftSim
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-[0.15em] text-rift-goldbright mb-1">
          <span className="bg-gold-sheen bg-clip-text text-transparent">
            DRAFT
          </span>
          <span className="text-rift-gold/90 ml-2">SIM</span>
        </h1>
        <div className="ornament mb-8">
          <span className="text-[10px] tracking-[0.3em] text-rift-gold/50 uppercase whitespace-nowrap px-2">
            {ornament}
          </span>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className={spinnerClass} aria-hidden />
          <p
            className={
              status === "error"
                ? "text-[10px] uppercase tracking-[0.28em] text-red-300/90 max-w-xs"
                : "text-[10px] uppercase tracking-[0.35em] text-rift-mutedbright/80"
            }
          >
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
