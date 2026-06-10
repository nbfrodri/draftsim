"use client";

import { useEffect, useState } from "react";

import { useDraftStore } from "@/store/draftStore";
import {
  encodeMetaOverride,
  encodePairings,
  getActiveSynergies,
  type CounterPair,
  type Synergy,
} from "@/lib/championMeta";
import { HARD_COUNTERS } from "@/lib/draftAI/data";
import { isDesktop, saveFileNative } from "@/lib/desktopStorage";
import MetaPanel from "./MetaPanel";

// Season dashboard section: the season's CURRENT (evolving) meta —
// tiers, synergies, and counters. While the season view is open the
// active meta IS season.currentMeta and every MetaPanel mutation
// writes through into the season (store-level sync), so the familiar
// tournament-setup controls work unchanged here. On top of those this
// adds export (META1:/PAIR1: codes — file on desktop, clipboard on
// web) and save-to-library so a season's evolved meta can be reused in
// other modes or shared.

export default function SeasonMetaPanel() {
  const season = useDraftStore((s) => s.season);
  const metaOverride = useDraftStore((s) => s.metaOverride);
  const synergyOverride = useDraftStore((s) => s.synergyOverride);
  const counterOverride = useDraftStore((s) => s.counterOverride);
  const createMetaPreset = useDraftStore((s) => s.createMetaPreset);
  const createPairingsPreset = useDraftStore((s) => s.createPairingsPreset);

  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  // Web fallback: when the clipboard is blocked, surface the code in a
  // textarea the user can copy manually.
  const [fallbackCode, setFallbackCode] = useState<string | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (!season) return null;
  const complete = season.status === "complete";

  // The season's current pairings — overrides when set, otherwise the
  // baseline tables (what the AI is actually using).
  const currentSynergies: Synergy[] = synergyOverride ?? [
    ...getActiveSynergies(),
  ];
  const currentCounters: CounterPair[] = counterOverride ?? [...HARD_COUNTERS];

  const deliverCode = async (code: string, fileName: string, what: string) => {
    if (isDesktop()) {
      const result = await saveFileNative({
        defaultPath: fileName,
        filters: [{ name: "DraftSim", extensions: ["json"] }],
        content: code,
      });
      if (result.ok) {
        setFeedback({ kind: "ok", text: `${what} saved to file` });
      } else if (result.error && result.error !== "cancelled") {
        setFeedback({ kind: "err", text: `Save failed: ${result.error}` });
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setFeedback({ kind: "ok", text: `${what} code copied to clipboard` });
    } catch {
      setFallbackCode(code);
    }
  };

  const safeName = season.name.replace(/[\\/:*?"<>|]/g, "_") || "season";

  const handleExportTiers = async () => {
    if (!metaOverride) return;
    try {
      const code = await encodeMetaOverride(metaOverride);
      await deliverCode(code, `${safeName}.meta.json`, "Tier list");
    } catch (e) {
      setFeedback({
        kind: "err",
        text: `Encode failed: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  };

  const handleExportPairings = async () => {
    try {
      const code = await encodePairings(
        currentSynergies,
        currentCounters,
        `${season.name} pairings`,
      );
      await deliverCode(code, `${safeName}.pairings.json`, "Pairings");
    } catch (e) {
      setFeedback({
        kind: "err",
        text: `Encode failed: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  };

  const handleSaveTiers = () => {
    if (!metaOverride) return;
    createMetaPreset(`${season.name} meta`, metaOverride);
    setFeedback({ kind: "ok", text: "Saved to Tier List Library" });
  };

  const handleSavePairings = () => {
    createPairingsPreset(
      `${season.name} pairings`,
      currentSynergies,
      currentCounters,
    );
    setFeedback({ kind: "ok", text: "Saved to Pairings Library" });
  };

  const actionCls =
    "px-2 py-1.5 border border-rift-line text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright hover:text-rift-goldbright hover:border-rift-gold/50 hover:bg-rift-gold/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-rift-mutedbright disabled:hover:border-rift-line disabled:hover:bg-transparent";

  return (
    <div className="mb-8 border border-rift-line/40 bg-rift-bg/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="font-display text-sm tracking-[0.2em] uppercase text-rift-goldbright">
          {open ? "▾" : "▸"} Season Meta
        </span>
        <span className="text-[9px] uppercase tracking-[0.25em] text-rift-muted">
          {complete
            ? "Final state of the season's meta"
            : "Evolves all season · edits apply to upcoming events"}
        </span>
      </button>

      {open && (
        <div className="border-t border-rift-line/30 px-3 py-3">
          <MetaPanel variant={complete ? "view-only" : "compact"} />

          {/* Export / save the season's current meta */}
          <div className="mt-3 pt-3 border-t border-rift-line/30">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[9px] uppercase tracking-[0.3em] text-rift-gold/60">
                Export &amp; Save
              </span>
              {feedback && (
                <span
                  className={`text-[9px] uppercase tracking-[0.2em] ${
                    feedback.kind === "ok"
                      ? "text-rift-goldbright"
                      : "text-rift-redbright"
                  }`}
                >
                  {feedback.text}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => void handleExportTiers()}
                disabled={!metaOverride}
                className={actionCls}
                title={
                  metaOverride
                    ? "Export the season's tier list as a META1: code"
                    : "The season is on the default meta — randomize or edit first"
                }
              >
                Export Tiers
              </button>
              <button
                type="button"
                onClick={() => void handleExportPairings()}
                className={actionCls}
                title="Export the season's synergies & counters as a PAIR1: code"
              >
                Export Pairings
              </button>
              <button
                type="button"
                onClick={handleSaveTiers}
                disabled={!metaOverride}
                className={actionCls}
                title={
                  metaOverride
                    ? "Save the season's tier list to your library"
                    : "The season is on the default meta — randomize or edit first"
                }
              >
                Save Tiers
              </button>
              <button
                type="button"
                onClick={handleSavePairings}
                className={actionCls}
                title="Save the season's synergies & counters to your library"
              >
                Save Pairings
              </button>
            </div>

            {fallbackCode && (
              <div className="mt-2">
                <div className="text-[9px] uppercase tracking-[0.25em] text-rift-muted mb-1">
                  Clipboard blocked — copy the code manually:
                </div>
                <textarea
                  readOnly
                  value={fallbackCode}
                  onFocus={(e) => e.target.select()}
                  className="w-full h-16 bg-rift-bg/80 border border-rift-line text-rift-mutedbright text-[10px] p-2 outline-none focus:border-rift-gold/50"
                />
                <button
                  type="button"
                  onClick={() => setFallbackCode(null)}
                  className="mt-1 px-2 py-1 text-[9px] uppercase tracking-[0.25em] text-rift-mutedbright/60 hover:text-rift-goldbright"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
