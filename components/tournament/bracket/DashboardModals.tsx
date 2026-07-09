"use client";

import { useDraftStore } from "@/store/draftStore";

// Save-tournament modal: shows the encoded TOUR1: code in a textarea so
// the user can copy it (auto-copy attempted on open). The same code can
// be pasted into the entry-menu Import flow to resume from this exact
// state — bracket position, per-match results, in-flight series.
export function SaveTournamentModal({
  code,
  pending,
  feedback,
  onCopy,
  onClose,
}: {
  code: string | null;
  pending: boolean;
  feedback: string | null;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border-2 border-rift-gold/60 bg-rift-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
              Save Tournament
            </div>
            <h2 className="font-display text-xl tracking-wider text-rift-goldbright">
              Tournament Code
            </h2>
          </div>
          {feedback && (
            <span className="text-[9px] uppercase tracking-[0.3em] text-rift-goldbright">
              {feedback}
            </span>
          )}
        </div>
        <p className="text-[10px] text-rift-mutedbright/75 mb-3 leading-relaxed">
          Copy this code to save the tournament — including the active match
          and any in-flight series. Paste it on the entry menu&rsquo;s{" "}
          <span className="text-rift-goldbright">Import Tournament Code</span>{" "}
          to resume.
        </p>
        <textarea
          readOnly
          value={pending ? "Generating…" : code ?? ""}
          onClick={(e) => e.currentTarget.select()}
          className="w-full h-32 bg-rift-bg/60 border border-rift-line text-rift-mutedbright text-xs font-mono p-2 outline-none focus:border-rift-gold/60 resize-none"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-rift-line text-rift-mutedbright text-[10px] uppercase tracking-[0.3em] hover:text-rift-goldbright hover:border-rift-gold/50 transition-all"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={pending || !code}
            className="px-4 py-1.5 border border-rift-gold/70 bg-rift-gold/15 text-rift-goldbright text-[10px] uppercase tracking-[0.3em] hover:bg-rift-gold/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

// Full-screen "simulating" overlay shown while a Sim All / Sim One
// pass is in progress. The store sets `simulating` true on the same
// render cycle the user clicks the button; the bulk loop then runs
// asynchronously, yielding between matches, and publishes lightweight
// progress (done/total match counts) via `simProgress` — rendered here
// so the user sees the run advance instead of a frozen spinner.
// Lightweight shell shown while the replay modal chunk loads. Keeps the
// backdrop + dismiss affordance instant so "View recap" feels responsive.
export function ReplayLoadingOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-2 py-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-2 border-rift-gold/50 bg-rift-panel px-8 py-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center mb-3">
          <div className="w-6 h-6 border-2 border-rift-gold/30 border-t-rift-goldbright rounded-full animate-spin" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.4em] text-rift-gold/70">
          Loading replay…
        </div>
      </div>
    </div>
  );
}

export function SimulatingOverlay({ scope }: { scope: "match" | "all" }) {
  const progress = useDraftStore((s) => s.simProgress);
  const label = scope === "all" ? "Simulating remaining matches…" : "Simulating match…";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
      <div className="border-2 border-rift-gold/60 bg-rift-panel px-8 py-6 text-center shadow-glow-gold">
        <div className="flex items-center justify-center mb-3">
          <div className="w-6 h-6 border-2 border-rift-gold/30 border-t-rift-goldbright rounded-full animate-spin" />
        </div>
        <div className="font-display text-sm md:text-base tracking-[0.3em] uppercase text-rift-goldbright">
          {label}
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-rift-mutedbright/60 mt-1.5">
          {progress
            ? `${progress.done}/${progress.total} matches`
            : "Drafting + sim running"}
        </div>
      </div>
    </div>
  );
}
