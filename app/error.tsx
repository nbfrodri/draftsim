"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[draftsim] Root error:", error);
  }, [error]);

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-lg bg-rift-panel/80 border border-rift-gold/40 p-8 md:p-10 text-center">
        <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 rotate-45 bg-rift-gold" />
        <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 rotate-45 bg-rift-gold" />

        <div className="font-display text-5xl md:text-6xl tracking-[0.1em] text-rift-goldbright mb-3">
          <span className="bg-gold-sheen bg-clip-text text-transparent">DRAFT</span>
          <span className="text-rift-gold/90">SIM</span>
        </div>
        <div className="ornament mb-4">
          <span className="text-[10px] uppercase tracking-[0.4em] text-rift-red">
            Something went wrong
          </span>
        </div>
        <p className="text-sm text-rift-mutedbright mb-6 leading-relaxed">
          The simulator failed to load. This usually means the champion data source
          (CommunityDragon or Meraki Analytics) is unreachable. Check your connection
          and try again.
        </p>
        {error.digest && (
          <p className="text-[10px] uppercase tracking-[0.3em] text-rift-muted mb-6">
            Error ID: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="btn-gold w-full py-4 font-display text-base md:text-lg tracking-[0.3em] md:tracking-[0.4em]"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
